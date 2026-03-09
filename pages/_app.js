import AppLayout from '../components/AppLayout';
//import '../styles/globals.css'; // keep if you already have this; remove if not

export default function MyApp({ Component, pageProps }) {
  return (
    <AppLayout>
      <Component {...pageProps} />
    </AppLayout>
  );
}
