import { CarFront, Lock, LockOpen } from 'lucide-react'

type UnlockDetectionIllustrationProps = {
  isDetected: boolean
}

export default function UnlockDetectionIllustration({ isDetected }: UnlockDetectionIllustrationProps) {
  return (
    <div className="relative mx-auto flex h-[360px] w-full max-w-[440px] items-center justify-center overflow-hidden rounded-[32px] border border-[#E2E8F0] bg-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.12)_0%,rgba(255,255,255,0)_68%)]" />

      <div className="pointer-events-none absolute h-[300px] w-[300px] rounded-full border border-[#C7D2FE] opacity-90 animate-pulse" />
      <div className="pointer-events-none absolute h-[240px] w-[240px] rounded-full border border-[#C7D2FE] opacity-75 animate-pulse" style={{ animationDelay: '220ms' }} />
      <div className="pointer-events-none absolute h-[180px] w-[180px] rounded-full border border-[#C7D2FE] opacity-60 animate-pulse" style={{ animationDelay: '440ms' }} />
      <div className="pointer-events-none absolute h-[120px] w-[120px] rounded-full border border-[#C7D2FE] opacity-45 animate-pulse" style={{ animationDelay: '660ms' }} />

      <div className="relative flex h-44 w-44 items-center justify-center rounded-full bg-[#EEF2FF] text-[#5B21B6] shadow-[0_18px_40px_rgba(79,70,229,0.2)]">
        <CarFront className="h-22 w-22" strokeWidth={1.7} />

        <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-[#4F46E5] text-white shadow-[0_10px_22px_rgba(79,70,229,0.34)]">
          {isDetected ? (
            <LockOpen className="h-7 w-7 animate-pulse" strokeWidth={2.2} />
          ) : (
            <Lock className="h-7 w-7" strokeWidth={2.2} />
          )}
        </div>
      </div>
    </div>
  )
}
