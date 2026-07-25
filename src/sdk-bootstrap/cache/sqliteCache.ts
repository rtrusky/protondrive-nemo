import Database from 'better-sqlite3';

import type { EntityResult, ProtonDriveCache } from '@protontech/drive-sdk';

/**
 * Ported from ProtonDriveApps/sdk `cli/src/cache/sqliteCache.ts`: same schema
 * and behavior, `bun:sqlite` swapped for `better-sqlite3` (Node). See
 * ../../../VENDOR.md.
 */
export class SQLiteCache implements ProtonDriveCache<string> {
    private db: Database.Database;

    constructor(cacheFile: string) {
        this.db = new Database(cacheFile);
        this.db.exec('CREATE TABLE IF NOT EXISTS entities (key TEXT PRIMARY KEY, value TEXT)');
        this.db.exec('CREATE TABLE IF NOT EXISTS entities_labels (label TEXT, key TEXT, UNIQUE (label, key))');
    }

    async clear() {
        this.db.exec('DELETE FROM entities');
        this.db.exec('DELETE FROM entities_labels');
    }

    async setEntity(key: string, data: string, tags?: string[]) {
        this.db.prepare('INSERT OR REPLACE INTO entities (key, value) VALUES (?, ?)').run(key, data);

        this.db.prepare('DELETE FROM entities_labels WHERE key = ?').run(key);

        for (const tag of tags || []) {
            this.db.prepare('INSERT OR REPLACE INTO entities_labels (label, key) VALUES (?, ?)').run(tag, key);
        }
    }

    async getEntity(key: string) {
        const result = this.db.prepare('SELECT value FROM entities WHERE key = ?').get(key) as
            | { value: string }
            | undefined;
        if (!result) {
            throw Error(`Entity ${key} not found`);
        }
        return result.value;
    }

    async *iterateEntities(keys: string[]): AsyncGenerator<EntityResult<string>> {
        for (const key of keys) {
            try {
                const value = await this.getEntity(key);
                yield { key, ok: true, value };
            } catch (error) {
                yield { key, ok: false, error: `${error}` };
            }
        }
    }

    async *iterateEntitiesByTag(tag: string): AsyncGenerator<EntityResult<string>> {
        const rows = this.db.prepare('SELECT key FROM entities_labels WHERE label = ?').all(tag) as { key: string }[];
        yield* this.iterateEntities(rows.map((row) => row.key));
    }

    async removeEntities(keys: string[]) {
        const deleteEntity = this.db.prepare('DELETE FROM entities WHERE key = ?');
        const deleteLabel = this.db.prepare('DELETE FROM entities_labels WHERE key = ?');
        for (const key of keys) {
            deleteEntity.run(key);
            deleteLabel.run(key);
        }
    }
}
