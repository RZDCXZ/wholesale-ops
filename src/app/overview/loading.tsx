export default function OverviewLoading() {
  return (
    <div aria-label="正在加载经营总览" aria-busy="true">
      <div className="mb-[18px] h-9 w-32 animate-pulse rounded bg-[#e4e7ec]" />
      <div className="min-h-[360px] animate-pulse rounded-lg border border-[#e4e7ec] bg-white" />
    </div>
  );
}
