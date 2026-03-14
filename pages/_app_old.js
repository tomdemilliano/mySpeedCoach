import AppLayout from '../components/AppLayout';
import Head from 'next/head';
//import '../styles/globals.css'; // keep if you already have this; remove if not

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0f172a" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="icon" href="/icons/icon-192.png" />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; }
          html, body {
            margin: 0;
            padding: 0;
            background-color: #0f172a;
          }
        `}
        </style>
      </Head>
      <AppLayout>
        <Component {...pageProps} />
      </AppLayout>
    </>
  );
}
