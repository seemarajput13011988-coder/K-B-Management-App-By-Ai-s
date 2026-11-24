export function Skeleton({ h = 16, w = '100%', r = 10 }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skel" aria-hidden="true" style={{ height: h, width: w, borderRadius: r }} />;
}

export function SkeletonCards({ n = 3 }: { n?: number }) {
  return <div className="skel-list" role="status" aria-label="Loading">
    {Array.from({ length: n }, (_, index) => <Skeleton key={index} h={84} r={18} />)}
  </div>;
}
