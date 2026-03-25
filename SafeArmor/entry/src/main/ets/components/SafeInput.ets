@Component
export struct SafeInput {
  @Link text: string;
  @Prop placeholder: string;
  @Prop isPassword: boolean;
  @State show = false;

  build() {
    Row() {
      TextField({ value: this.text, placeholder: this.placeholder })
        .type(this.isPassword && !this.show ? InputType.Password : InputType.Normal)
        .width('85%')
        .onChange(v => this.text = v);

      if (this.isPassword) {
        Button(this.show ? '显示' : '隐藏')
          .backgroundColor(Color.Transparent)
          .onClick(() => this.show = !this.show);
      }
    }
    .width('90%')
    .padding(10)
    .border({ width: 1, radius: 8 })
    .margin(5);
  }
}