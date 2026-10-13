import Image from 'next/image';
import Link from 'next/link';

/** Logo + wordmark linking home (shared by every header). */
export function BrandLink() {
  return (
    <Link href="/" className="brand" aria-label="AuraFit home">
      <Image src="/logo.jpg" alt="" width={40} height={40} className="brand__logo" priority />
      <span className="brand__text">
        <span className="brand__name">AURAFIT</span>
        <span className="brand__tag">Solo Leveling RPG Fitness</span>
      </span>
    </Link>
  );
}
