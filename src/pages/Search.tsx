import { useEffect, useRef, useState } from "react";
import { api, fmt, isMobile } from "../api";
import type { HotWord, Post, RankItem, VideoCard } from "../types";
import { useStore } from "../store";
import { Masonry, RankRow } from "../components/cards";
import { Empty, Img } from "../components/ui";
import { IBack, IClose, IFireF, IRefresh, ISearch, ITrophy } from "../icons";

const HOT_TAGS = ["都市", "逆袭", "古风", "系统", "后宫", "校园", "仙侠", "职场", "大男主", "御姐", "脑洞", "奇幻"];

export default function Search({ active, wide }: { active: boolean; wide: boolean }) {
  const { push, searchHist, addSearch, clearSearchHist, toast } = useStore();
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [tab, setTab] = useState<"video" | "post">("video");
  const [items, setItems] = useState<VideoCard[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  /* 请求序号：新关键词或清空时自增，过期请求的结果直接丢弃 */
  const seqRef = useRef(0);
  const [hotWords, setHotWords] = useState<HotWord[]>([]);

  /* 移动端进入搜索页不自动聚焦：iOS 会立刻弹键盘遮住内容（#20）。
     桌面端没有软键盘，聚焦便于直接打字。 */
  useEffect(() => {
    if (active && !isMobile) inputRef.current?.focus();
  }, [active]);

  const refreshHot = () => {
    api.searchHot().then((r) => setHotWords(r?.items || [])).catch(() => {});
  };
  useEffect(() => {
    if (active) refreshHot();
  }, [active]);

  const run = async (keyword: string, p: number, kind: "video" | "post" = tab) => {
    if (p > 1 && (busy.current || p > pages)) return;
    const seq = p === 1 ? ++seqRef.current : seqRef.current;
    busy.current = true;
    setLoading(true);
    try {
      const res = await api.search(keyword, p, 20, kind);
      if (seq !== seqRef.current) return;
      if (kind === "post") {
        const list = (res?.items || []) as unknown as Post[];
        setPosts((prev) => {
          const base = p === 1 ? [] : prev;
          const seen = new Set(base.map((x) => x.id));
          return [...base, ...list.filter((x) => !seen.has(x.id))];
        });
      } else {
        const list = (res?.items || []) as unknown as VideoCard[];
        setItems((prev) => {
          const base = p === 1 ? [] : prev;
          const seen = new Set(base.map((x) => x.id));
          return [...base, ...list.filter((x) => !seen.has(x.id))];
        });
      }
      setPage(p);
      setPages(res?.pagination?.pages || 1);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message || "Search failed");
    } finally {
      if (seq === seqRef.current) {
        busy.current = false;
        setLoading(false);
      }
    }
  };

  const changeTab = (next: "video" | "post") => {
    if (next === tab) return;
    setTab(next);
    setItems([]);
    setPosts([]);
    setPage(0);
    setPages(1);
    setErr(null);
    if (submitted) void run(submitted, 1, next);
  };

  const submit = (keyword: string) => {
    const k = keyword.trim();
    if (!k) return;
    setSubmitted(k);
    addSearch(k);
    setItems([]);
    setPosts([]);
    setPage(0);
    setPages(1);
    run(k, 1);
  };

  const querying = submitted.length > 0;

  return (
    <div className="absolute inset-0 bg-bg flex flex-col">
      {/* 搜索栏 */}
      <div className="shrink-0 px-4 pb-3 flex items-center gap-2.5" style={{ paddingTop: "calc(var(--sat, 0px) + 12px)" }}>
        <form className="flex-1 flex items-center gap-2 h-11 rounded-(--r-ctl) bg-s3 px-3.5 focus-within:bg-s4 transition-colors"
          onSubmit={(e) => { e.preventDefault(); submit(q); }}>
          <ISearch size={17} className="text-mut shrink-0" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dramas, creators, or genres…"
            className="flex-1 min-w-0 bg-transparent text-[13.5px] text-on placeholder-dim outline-none" />
          {q && <button type="button" onClick={() => { seqRef.current++; busy.current = false; setLoading(false); setQ(""); setSubmitted(""); setItems([]); setPosts([]); }} className="w-5 h-5 rounded-full bg-s4 flex items-center justify-center text-mut pressable"><IClose size={11} /></button>}
        </form>
        <button onClick={() => push({ kind: "ranks" })} aria-label="Rankings"
          className="w-11 h-11 rounded-(--r-sm) flex items-center justify-center bg-primary text-on-primary pressable elev-2">
          <ITrophy size={19} />
        </button>
      </div>

      <div className="flex-1 scroll-y px-4 pb-24">
        {!querying ? (
          <>
            {hotWords.length > 0 && (
              <div className="mt-1 rounded-(--r-md) bg-s2 p-3.5 a-rise">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-on/90"><IFireF size={15} className="text-primary" />热搜榜</span>
                  <button onClick={refreshHot} className="flex items-center gap-1 text-[11px] text-mut pressable"><IRefresh size={12} />刷新</button>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-3">
                  {hotWords.slice(0, 10).map((h, i) => (
                    <button key={h.word} onClick={() => { setQ(h.word); submit(h.word); }}
                      className="flex items-center gap-2 min-w-0 text-left pressable">
                      <span className={`w-4.5 h-4.5 shrink-0 rounded-(--r-xs) flex items-center justify-center text-[10.5px] font-bold ${i < 3 ? "bg-primary text-on-primary" : "bg-s3 text-dim"}`}>{i + 1}</span>
                      <span className="truncate text-[12px] text-on/85 flex-1">{h.word}</span>
                      <span className="text-[10px] text-dim shrink-0">{fmt(h.heat)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {searchHist.length > 0 && (
              <div className="mt-1 a-rise">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold text-on">Search history</span>
                  <button onClick={clearSearchHist} className="text-[11px] text-dim pressable">Clear</button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2.5">
                  {searchHist.map((h) => (
                    <button key={h} onClick={() => { setQ(h); submit(h); }} className="px-3.5 h-8 rounded-(--r-ctl) bg-s3 text-[12px] text-on/80 pressable">{h}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 rounded-(--r-md) bg-s2 p-3.5 a-rise">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-on/90"><IFireF size={15} className="text-primary" />Popular genres</span>
                <button onClick={() => push({ kind: "ranks" })} className="text-[11px] text-primary font-semibold pressable">Full rankings ›</button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {HOT_TAGS.map((t) => (
                  <button key={t} onClick={() => { setQ(t); submit(t); }}
                    className="px-3 h-7 rounded-(--r-ctl) bg-s3 text-[12px] text-on/85 pressable">{t}</button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between mt-6 mb-2.5">
              <span className="text-[13px] font-bold text-on">Recommended for you</span>
              <button onClick={() => submit(HOT_TAGS[Math.floor(Math.random() * HOT_TAGS.length)])}
                className="flex items-center gap-1 text-[11.5px] text-mut pressable"><IRefresh size={13} />Refresh suggestions</button>
            </div>
            <p className="text-[11.5px] text-dim leading-relaxed">
              Enter a keyword and press Enter to search，You can also select a genre above to browse titles。
            </p>
          </>
        ) : (
          <>
            <div className="text-[11.5px] text-mut mt-1 mb-2.5">Results for “{submitted}” · <span className="text-primary font-bold">{items.length}</span> results</div>
            {items.length ? (
              <>
                <Masonry videos={items} wide={wide} onOpen={(v) => push({ kind: "feed", videoIds: items.map((x) => x.id), index: items.findIndex((x) => x.id === v.id), title: `Search · ${submitted}` })} />
                <div className="flex justify-center py-4">
                  {loading ? <div className="w-6 h-6 spinner" />
                    : page < pages ? (
                      <button onClick={() => run(submitted, page + 1)} className="px-5 h-9 rounded-(--r-ctl) bg-s3 text-[12px] text-on/85 pressable">Load more</button>
                    ) : <span className="text-[10.5px] text-dim">— You have reached the end —</span>}
                </div>
              </>
            ) : loading ? (
              <div className="flex justify-center py-12"><div className="w-8 h-8 spinner" /></div>
            ) : (
              <Empty icon={<ISearch size={26} />} title={err || "No matching results"} sub="Try a different keyword"
                action="See trending titles" onAction={() => push({ kind: "ranks" })} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ================= 排行榜 ================= */
const RANK_TABS = [
  { k: "hot", label: "Trending", desc: "Sort by popularity" },
  { k: "recommend", label: "Recommended", desc: "Sort by recommendations" },
  { k: "potential", label: "Rising", desc: "Sort by growth" },
] as const;

export function RankPage({ onBack, wide }: { onBack: () => void; wide: boolean }) {
  const { push, toast } = useStore();
  const [tab, setTab] = useState<"hot" | "recommend" | "potential">("hot");
  const [items, setItems] = useState<RankItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.rank(tab)
      .then((res) => { if (alive) setItems(res?.items || []); })
      .catch((e) => { if (alive) { setItems([]); toast((e as Error).message || "Could not load rankings", "info"); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tab, toast]);

  const max = Math.max(1, ...items.map((x) => x.metric_value || 0));
  const meta = RANK_TABS.find((t) => t.k === tab)!;

  return (
    <div className="absolute inset-0 bg-bg flex flex-col">
      <div className="shrink-0 relative overflow-hidden bg-s1" style={{ paddingTop: "var(--sat, 0px)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(90% 120% at 100% 0%, var(--p-pc) 0%, transparent 60%)", opacity: 0.32 }} />
        <div className="relative px-3 pt-2 pb-4">
          <button onClick={onBack} className="w-10 h-10 rounded-full flex items-center justify-center text-on hover:bg-s3 pressable"><IBack size={20} /></button>
          <div className="px-2 mt-1 flex items-end justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-(--r-sm) bg-pc text-on-pc flex items-center justify-center"><ITrophy size={20} /></span>
                <span className="text-[24px] font-bold tracking-wide text-on">HG Trending</span>
              </div>
              <div className="text-[11px] text-mut mt-1">{meta.desc} · Updated every 10 minutes</div>
            </div>
          </div>
          <div className="flex bg-s3 rounded-(--r-ctl) p-1 mt-3">
            {RANK_TABS.map((t) => (
              <button key={t.k} onClick={() => setTab(t.k)}
                className={`flex-1 h-8 rounded-(--r-ctl) text-[12px] font-semibold transition-all ${tab === t.k ? "tonal elev-1" : "text-mut"}`}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 scroll-y px-3.5 pt-3 pb-8">
        {loading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 spinner" /></div>
        ) : items.length ? (
          items.map((it) => (
            <RankRow key={`${it.video_id}-${it.rank}`} item={it} metricMax={max}
              onOpen={() => push({ kind: "feed", videoIds: items.map((x) => x.video_id), index: items.findIndex((x) => x.video_id === it.video_id), title: "HG Trending" })} />
          ))
        ) : (
          <Empty icon={<ITrophy size={26} />} title="Rankings are empty" sub="Check back later or browse recommendations on Home" />
        )}
        {wide && <div className="h-2" />}
      </div>
    </div>
  );
}