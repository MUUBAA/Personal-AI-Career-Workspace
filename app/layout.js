import "./globals.css";
export const metadata = { title: "JobKit", description: "Free ATS-friendly resume builder and scorer" };
export default function Root({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
