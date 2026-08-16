import logoGetaCar from '../assets/logo-getacar.svg'

type LogoProps = {
  width?: number | string
  className?: string
}

export default function Logo({ width = 220, className }: LogoProps) {
  const normalizedWidth = typeof width === 'number' ? `${width}px` : width

  return (
    <img
      src={logoGetaCar}
      alt="GetaCar"
      style={{ width: normalizedWidth, height: 'auto' }}
      className={className}
      loading="eager"
      decoding="async"
    />
  )
}
