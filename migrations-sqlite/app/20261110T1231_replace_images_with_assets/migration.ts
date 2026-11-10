#!/usr/bin/env -S node
import type { Contract as End } from './end-contract';
import endContract from './end-contract.json' with { type: 'json' };
import type { Contract as Start } from './start-contract';
import startContract from './start-contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma-next/sqlite/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        table: 'assets',
        columns: [
          col('bytes', 'BLOB', { notNull: true }),
          col('created_at', 'TEXT', { notNull: true, default: fn('now()') }),
          col('hash', 'TEXT', { notNull: true }),
          col('media_type', 'TEXT', { notNull: true }),
        ],
        constraints: [primaryKey(['hash'])],
      }),
      this.dropTable({ table: 'images' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
