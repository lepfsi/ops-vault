/**
 * Minimal Node ambient types for packages/db.
 * Avoids hard dependency on hoisted @types/node during isolated builds
 * while still typing `node:sqlite` / `node:crypto` used by VaultStore.
 */

declare module "node:crypto" {
  export function randomUUID(): `${string}-${string}-${string}-${string}-${string}`;
}

declare module "node:sqlite" {
  export type SQLInputValue =
    | null
    | number
    | bigint
    | string
    | ArrayBufferView;

  export type SQLOutputValue =
    | null
    | number
    | bigint
    | string
    | Uint8Array;

  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export class StatementSync {
    all(...anonymousParameters: SQLInputValue[]): Record<string, SQLOutputValue>[];
    get(
      ...anonymousParameters: SQLInputValue[]
    ): Record<string, SQLOutputValue> | undefined;
    run(...anonymousParameters: SQLInputValue[]): StatementResultingChanges;
  }

  export interface DatabaseSyncOptions {
    open?: boolean;
    enableForeignKeyConstraints?: boolean;
  }

  export class DatabaseSync {
    constructor(path: string | URL, options?: DatabaseSyncOptions);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
