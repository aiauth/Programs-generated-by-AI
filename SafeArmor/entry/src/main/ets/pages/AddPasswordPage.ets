import { PasswordCategory } from '../model/PasswordEntry';
import { CryptoManager } from '../security/CryptoManager';
import { DatabaseUtil } from '../utils/storage/DatabaseUtil';
import { SafeInput } from '../components/SafeInput';
import { PasswordStrengthBar } from '../components/PasswordStrengthBar';
import { v4 as uuid } from '../utils/common/UuidUtil';

@Entry
@Component
struct AddPasswordPage {
  @State title = '';
  @State username = '';
  @State pwd = '';
  @State category = PasswordCategory.OTHER;
  @State remark = '';
  @State score = 0;
  private crypto = CryptoManager.getInstance();
  private db = DatabaseUtil.getInstance();

  build() {
    Navigation() {
      Scroll() {
        Column({ space: 10 }) {
          TextField({ placeholder: "应用名称", value: this.title }).onChange(v => this.title = v);
          TextField({ placeholder: "账号", value: this.username }).onChange(v => this.username = v);
          SafeInput({ text: $$this.pwd, placeholder: "密码", isPassword: true }).onChange(() => {
            this.score = this.calc(this.pwd);
          });
          PasswordStrengthBar({ score: this.score });
          Select([
            { value: PasswordCategory.SOCIAL },
            { value: PasswordCategory.FINANCIAL },
            { value: PasswordCategory.WORK },
            { value: PasswordCategory.GAME },
            { value: PasswordCategory.OTHER }
          ]).onChange(v => this.category = v);
          Button("保存加密").onClick(() => this.save());
        }
        .width('100%')
        .padding(14);
      }
    }
    .title("新增密码");
  }

  calc(pwd: string): number {
    let s = 0;
    if (pwd.length >= 8) s++;
    if (pwd.length >= 12) s++;
    if (/[A-Z]/.test(pwd)) s++;
    if (/[0-9]/.test(pwd)) s++;
    if (/[^A-Za-z0-9]/.test(pwd)) s++;
    return Math.min(5, s);
  }

  async save() {
    const key = await this.crypto.generateAesKey();
    const enc = await this.crypto.encrypt(this.pwd, key);
    await this.db.insert({
      id: uuid(),
      title: this.title,
      username: this.username,
      encryptedPassword: enc,
      category: this.category,
      strengthScore: this.score,
      createTime: Date.now(),
      updateTime: Date.now(),
      remark: this.remark
    });
    router.back();
  }
}