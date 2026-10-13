// Keeps clinical values left-to-right even inside Arabic text: "110.4 mg", "MRN-10002", "HS-20261012-7F3A9C"
export default function Ltr({ children, ...props }) {
  return <bdi dir="ltr" className="num" {...props}>{children}</bdi>;
}