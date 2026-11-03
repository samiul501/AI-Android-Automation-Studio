<div align="center">

# 📱 AI Android Automation Studio

### Use your phone once. Get a ready-to-run test script. Let AI explain what broke.

Record real taps on a physical Android phone → get clean test code → run it → get a report.
No Android Studio. No emulator. No manual scripting.

![Node](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Claude](https://img.shields.io/badge/AI-Claude-D97757)
![Tests](https://img.shields.io/badge/tests-200%20passing-brightgreen)

</div>

---

## ✨ What it does

```
  📱 Record      →   📝 Generate     →   ▶️ Run          →   🤖 Diagnose     →   📊 Report
  Use your phone     Clean TS/JS         Live step-by-step   AI explains         HTML · PDF · XLSX
  like normal        test script         progress            the failure         JSON · ZIP
```

| | |
|---|---|
| 📱 **Record** | Tap, swipe and type on a real phone. Every action is captured automatically. |
| 🎯 **Smart locators** | Picks the most stable way to find each button (ID, label, text) and only uses screen coordinates as a last resort. |
| 📝 **Generate scripts** | Get readable [Mobilewright](https://www.npmjs.com/package/mobilewright) tests in TypeScript or JavaScript, with assertions added for you. |
| ▶️ **Run live** | Watch each step turn ✅ in real time. Failures come with screenshots. |
| 🤖 **AI failure analysis** | Claude explains why a test failed and suggests a fix. You approve it, and a backup is made first. |
| 📄 **Document → Tests** | Upload a PDF, Word, Excel, CSV, TXT, MD or JSON spec. AI proposes test cases, you approve them. |
| 📊 **Reports** | Download results as HTML, PDF, Excel, JSON or ZIP. |
| 🔍 **Live inspector** | Browse the on-screen UI of your connected phone. |

## 🚀 Quick start

**You need:** [Node.js 20+](https://nodejs.org), [ADB](https://developer.android.com/tools/releases/platform-tools) (Platform-Tools only), and an Android phone with **USB debugging** turned on.

```bash
git clone https://github.com/samiul501/AI-Android-Automation-Studio.git
cd AI-Android-Automation-Studio
npm install
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
npm run dev
```

Open **http://localhost:5173**, plug in your phone, and you're ready.

> 💡 **AI features are optional.** To turn them on, put your `ANTHROPIC_API_KEY` in `.env`. Everything else works without it.

## 🧭 How to use it

1. **Connect** your phone. The header shows *connected* once ADB sees it.
2. **Record** a flow in your app, then stop.
3. **Generate** a TS or JS script and tweak it in the built-in editor if you like.
4. **Run** it and watch the live progress.
5. **Analyze** any failure with AI, then **download** your report.

A generated script looks like this:

```ts
test('Login flow', async ({ screen }) => {
  await test.step('Tap "Sign in"', async () => {
    await screen.getByText('Sign in').tap();
  });
  await test.step('Enter password', async () => {
    await screen.getByLabel('Password').fill(process.env.TEST_PASSWORD ?? '');
  });
  await test.step('Verify "Welcome" is visible', async () => {
    await expect(screen.getByText('Welcome')).toBeVisible();
  });
});
```

Passwords are read from environment variables, never written into the script.

## 🛡️ Built to be trustworthy

- ✅ **Real status only.** "Connected" and "Passed" are never faked.
- ✅ **AI never changes your code silently.** Every fix needs your approval and gets a backup.
- ✅ **No secrets in code.** API keys and passwords stay in environment variables.
- ✅ **No Android Studio needed.** Just ADB.

## 🧰 Built with

React 19 · Vite · Tailwind · Express · TypeScript · Mobilewright · Playwright · Claude API

## ⚠️ Good to know

- Android only, one phone at a time.
- Runs locally with no login, so keep it on `localhost`.
- Recorded text typed on the soft keyboard is inferred and may occasionally be missed. The script marks it with a `TODO` instead of guessing.

## 🆘 Something not working?

| Problem | Fix |
|---|---|
| `adb-missing` | Install Platform-Tools and add it to your `PATH` |
| `unauthorized` | Unlock the phone and tap **Allow USB debugging** |
| `disconnected` | Check the cable, then run `adb devices` |
| AI says *API key not set* | Add `ANTHROPIC_API_KEY` to `.env` and restart |

Still stuck? Run `npx mobilewright doctor` for a full environment check.

## 📚 More

- [`docs/PHASES.md`](docs/PHASES.md): detailed build log and technical notes
- [`CLAUDE.md`](CLAUDE.md): rules for AI coding assistants
- Commands: `npm run test` · `npm run lint` · `npm run build`

## 🤝 Contributing

Fork, create a branch, run `npm run lint && npm run test`, and open a pull request.

---

<div align="center">
Built on <a href="https://www.npmjs.com/package/mobilewright">Mobilewright</a>, ADB and the <a href="https://www.anthropic.com">Anthropic Claude</a> API.
</div>
