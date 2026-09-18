# Background

My team uses Wolt every day for our lunch order.  
We use Wolt's shared order and split the payment on Cibus.  
Instead of manually splitting the payment on Cibus,  
I've created this nice Chrome extension to achieve it automatically. 

# Development

Use Node.js 22 or newer.

```sh
npm install
npm test
npm run build
npm run package
```

`npm run build` writes a clean unpacked extension to `dist/`; it does not change
the extension version. `npm run package` creates `pimp-my-wolt.zip` from that
runtime-only directory. Use `npm run release:patch` for an explicit version
change; the build rejects a mismatch between `package.json` and `manifest.json`.

Automatic name matching sends the unresolved Wolt and available Cibus names
directly to the OpenRouter provider selected in extension settings. The API key
is stored locally by Chrome and masked in the settings screen, but a client-side
extension cannot protect a secret from its own user.

To run the paid live quality check, deliberately provide credentials in the
environment and run:

```sh
OPENROUTER_API_KEY=... OPENROUTER_MODEL=provider/model npm run test:integration
```

That command contacts OpenRouter, may incur cost, sends only the committed
synthetic fixture to the selected provider, and quality can vary by model.

# Installation

1. Visit [Pimp my Wolt](https://chrome.google.com/webstore/detail/pimp-my-wolt/edfemdoibbcbmkojfdeldnllcbnpmfld) Chrome Web Store page and click `Add to Chrome`.  

2. Set your group name. Different users may share the same group name for easier maintenance of group members:  

https://user-images.githubusercontent.com/22027545/188240633-95b28090-7746-4547-a123-ffe967babd29.mov
   
3. Onboard new members to your group. Onboarding is done once and used for every future order.  
If you missed someone, don't worry, you can always try our automatic splitting algorithm.  
From now on you'll never split payments manually! 🎉

https://user-images.githubusercontent.com/22027545/188240914-9a76a532-df71-4f45-a79a-55be08b3d91e.mov
