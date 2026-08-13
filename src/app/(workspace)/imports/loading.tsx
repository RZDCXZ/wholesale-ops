export default function ImportsLoading() {
  return (
    <div aria-label="导入工作台加载中" className="animate-pulse">
      <div className="h-9 w-40 rounded bg-[#e4e7ec]" />
      <div className="mt-3 h-4 w-80 max-w-full rounded bg-[#eef0f3]" />
      <div className="mt-6 h-[420px] rounded-lg border border-[#e4e7ec] bg-white" />
    </div>
  );
}
