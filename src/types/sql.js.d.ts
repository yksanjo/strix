declare module 'sql.js' {
  interface SqlJsStatic {
    Database: typeof Database;
  }

  interface QueryResults {
    columns: string[];
    values: any[][];
  }

  interface Statement {
    bind(params?: any[]): boolean;
    step(): boolean;
    get(): any[];
    getAsObject(): Record<string, any>;
    run(params?: any[]): void;
    reset(): void;
    free(): boolean;
  }

  class Database {
    constructor(data?: ArrayLike<number> | Buffer | null);
    run(sql: string, params?: any[]): Database;
    exec(sql: string): QueryResults[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  function initSqlJs(config?: any): Promise<SqlJsStatic>;

  export default initSqlJs;
  export { Database, Statement, QueryResults, SqlJsStatic };
}
