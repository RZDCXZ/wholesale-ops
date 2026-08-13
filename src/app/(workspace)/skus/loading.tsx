export default function SkusLoading() {
  return <div aria-label="SKU 加载中" className="animate-pulse"><div className="h-9 w-28 rounded bg-[#e4e7ec]" /><div className="mt-3 h-4 w-72 max-w-full rounded bg-[#eef0f3]" /><div className="mt-6 overflow-hidden rounded-lg border border-[#e4e7ec] bg-white"><div className="h-16 border-b border-[#e4e7ec] bg-[#f8fafc]" />{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-16 border-b border-[#eef0f3] last:border-b-0" />)}</div></div>;
}
