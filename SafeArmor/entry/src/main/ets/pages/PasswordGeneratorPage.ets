import { AppConstants } from '../constants/AppConstants';
import clipboard from '@ohos.clipboard';
import promptAction from '@ohos.promptAction';

@Entry
@Component
struct PasswordGeneratorPage {
  @State len = AppConstants.DEFAULT_PASSWORD_LENGTH;
  @State upper = true;
  @State lower = true;
  @State num = true;
  @State sym = true;
  @State res = '';

  build() {
    Navigation() {
      Scroll() {
        Column({ space: 16 }) {
          Text(this.res || "点击生成").fontSize(20).padding(20).backgroundColor(Color.White).borderRadius(12);
          Button("复制").enabled(!!this.res).onClick(() => {
            clipboard.setPlainText({ text: this.res });
            promptAction.showToast({ message: "已复制" });
          });
          Text(`长度：${this.len}`);
          Slider({ value: this.len, min: 8, max: 32 }).onChange(v => this.len = Math.floor(v));
          this.Switch("大写", $$this.upper);
          this.Switch("小写", $$this.lower);
          this.Switch("数字", $$this.num);
          this.Switch("符号", $$this.sym);
          Button("生成密码").onClick(() => this.gen());
        }
        .padding(20)
        .alignItems(HorizontalAlign.Center);
      }
    }
    .title("密码生成器");
  }

  @Component SwitchItem(label: string, v: Link<boolean>) {
    Row() { Text(label); Toggle({ isOn: v }); }
  }

  gen() {
    let c = '';
    if (this.upper) c += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (this.lower) c += 'abcdefghijklmnopqrstuvwxyz';
    if (this.num) c += '0123456789';
    if (this.sym) c += '!@#$%^&*()_+-=';
    if (!c) return promptAction.showToast({ message: "至少选一种" });
    let p = '';
    const arr = new Uint32Array(this.len);
    crypto.getRandomValues(arr);
    for (let i = 0; i < this.len; i++) p += c[arr[i] % c.length];
    this.res = p;
  }
}