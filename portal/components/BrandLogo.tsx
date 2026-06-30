import Image from "next/image";

interface BrandLogoProps {
  size?: number;
  className?: string;
}

/** Agent Solana Wallet mark — square, triangle, circle, arrow. */
export function BrandLogo({ size = 48, className = "" }: BrandLogoProps) {
  return (
    <Image
      src="/logo.png"
      alt="Agent Solana Wallet"
      width={size}
      height={size}
      className={`rounded-2xl ${className}`}
      priority
    />
  );
}
