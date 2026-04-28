import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="nl">
      <Head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Skippr" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="apple-touch-startup-image" href="/icons/skippr-logo-transparant.png" />
      </Head>
      <body style={{ margin: 0, padding: 0, backgroundColor: '#0f172a' }}>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
