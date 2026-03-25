import relationalStore from '@ohos.data.relationalStore';
import { Context } from '@ohos.app.ability.common';
import { PasswordEntry } from '../../model/PasswordEntry';

export class DatabaseUtil {
  private static instance: DatabaseUtil;
  private store?: relationalStore.RdbStore;
  private readonly TABLE = 'passwords';

  private constructor() {}
  public static getInstance(): DatabaseUtil {
    if (!this.instance) this.instance = new DatabaseUtil();
    return this.instance;
  }

  async init(ctx: Context) {
    if (this.store) return;
    const cfg = { name: 'safearmor.db', securityLevel: relationalStore.SecurityLevel.S1, context: ctx };
    this.store = await relationalStore.getRdbStore(cfg, 1);
    await this.store.executeSql(`CREATE TABLE IF NOT EXISTS ${this.TABLE} (id TEXT PRIMARY KEY,title TEXT,username TEXT,encryptedPassword TEXT,category TEXT,strengthScore INTEGER,createTime INTEGER,updateTime INTEGER,remark TEXT)`);
  }

  async insert(entry: PasswordEntry) {
    return await this.store!.insert(this.TABLE, entry);
  }

  async queryAll(): Promise<PasswordEntry[]> {
    const res = await this.store!.querySql(`SELECT * FROM ${this.TABLE} ORDER BY createTime DESC`);
    const list: PasswordEntry[] = [];
    while (res.goToNextRow()) {
      list.push({
        id: res.getString(0),
        title: res.getString(1),
        username: res.getString(2),
        encryptedPassword: res.getString(3),
        category: res.getString(4),
        strengthScore: res.getLong(5),
        createTime: res.getLong(6),
        updateTime: res.getLong(7),
        remark: res.getString(8)
      });
    }
    res.close();
    return list;
  }
}