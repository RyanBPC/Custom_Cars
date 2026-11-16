# Real parts from eBay (free)

The Build page's **Parts & prices** step can show a real eBay UK listing for each part on your build: the product
photo, its price and a link straight to it. It uses eBay's official, free API. You need your own free keys, and they
stay in `.env` on your computer (never on GitHub, never in the browser).

## 1. Make a free eBay developer account

1. Go to https://developer.ebay.com and click **Sign in** (top right), then **Join** if you don't have an account.
   You can use your normal eBay account.
2. Fill in the form. eBay checks new developer accounts, which can take up to a day. You'll get an email when it's ready.

## 2. Create your keys

1. Signed in at developer.ebay.com, open your name (top right) and choose **Application Keysets**.
2. Type a name for the app, for example `CustomCars`, and click **Create a keyset** in the **Production** column
   (not Sandbox: Sandbox only has test listings).
3. eBay asks about **Marketplace account deletion notifications**. This site doesn't save any eBay user data, so
   choose the option to **apply for an exemption**, pick the reason that says you don't keep eBay data, and confirm.
   The Production keys then switch on.

## 3. Put the keys in `.env`

1. In the project folder, open `.env` (if you don't have one yet, copy `.env.example` and rename the copy to `.env`).
2. From the Production keyset, copy:
   - **App ID (Client ID)** to `EBAY_CLIENT_ID=`
   - **Cert ID (Client Secret)** to `EBAY_CLIENT_SECRET=`

   It should look like this (with your own values, no spaces or quotes):
   ```
   EBAY_CLIENT_ID=YourName-CustomCa-PRD-1a2b3c4d5-6e7f8a9b
   EBAY_CLIENT_SECRET=PRD-1a2b3c4d5e6f-7a8b-9c0d-1e2f-3a4b
   ```
3. Save the file.

## 4. Check it works

Open a terminal in the project folder and run:

```
py server\app.py --check-ebay
```

It should say **Your eBay keys work** and list a few coilovers. Then close and reopen `start.bat`, go to Build,
add some parts, and scroll to step 3.

## Good to know

- It's free. eBay allows 5,000 searches a day, and the site remembers each search for 6 hours, so you'll use a tiny part of that.
- Keep the Cert ID secret like a password. Don't paste it into chats, issues or screenshots. If it ever leaks, delete
  the keyset on developer.ebay.com and make a new one.
- Without keys the site still works: each part is shown on the 3D car instead, with links to search the shops.
