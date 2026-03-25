import { NavPathStack } from '@kit.ArkUI';
import { PasswordEntry } from '../model/PasswordEntry';
import { AuthManager } from '../security/AuthManager';
import { DatabaseUtil } from '../utils/storage/DatabaseUtil';
import { isAppAuthenticated } from '../entryability/EntryAbility';

@Entry
@Component
export struct PasswordListPage {
  private nav = new NavPathStack();
  private auth = AuthManager.getInstance();
  private db = DatabaseUtil.getInstance();
  @State list: PasswordEntry[] = [];
  @State filtered: PasswordEntry[] = [];
  @State search = '';
  @State loading = true;

  build() {
    Navigation(this.nav) {
      if (this.loading) {
        LoadingProgress().center();
      } else if (!isAppAuthenticated) {
        Column() {
          Text("请解锁查看");
          Button("指纹/人脸解锁").onClick(() => this.doAuth());
        }.center().blur(10).backgroundColor(Color.Black).opacity(0.8);
      } else {
        Column() {
          Search({ placeholder: "搜索" }).onChange(v => {
            this.search = v;
            this.filtered = this.list.filter(i => i.title.includes(v) || i.username.includes(v));
          });
          List() {
            ForEach(this.filtered, (item) => {
              ListItem() {
                Row() {
                  Column() {
                    Text(item.title).fontSize(16);
                    Text(item.username).fontSize(12).fontColor(Color.Grey);
                  }.layoutWeight(1);
                  Text(item.category).fontSize(12).backgroundColor('#2d5bff').color(Color.White).padding(3);
                }
                .padding(14)
                .backgroundColor(Color.White)
                .borderRadius(12)
                .margin({ horizontal: 14, vertical: 4 });
              }
            });
          }
        }
      }
    }
    .title("安盾密码")
    .onReady(() => this.init())
    .menus([{ value: "新增", action: () => this.nav.pushPath({ name: "AddPasswordPage" }) }]);
  }

  async init() {
    await this.doAuth();
    this.list = await this.db.queryAll();
    this.filtered = this.list;
    this.loading = false;
  }

  async doAuth() {
    const ok = await this.auth.authenticate();
    (isAppAuthenticated as boolean) = ok;
  }
}