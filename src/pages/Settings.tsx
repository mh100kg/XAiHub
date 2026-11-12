import { useEffect, useState, type ReactNode } from "react";
import { api, APP_VERSION, hostOf, logLine, platform, type UpdateInfo } from "../api";
import { useStore } from "../store";
import { Modal, Toggle } from "../components/ui";
import LinePicker from "../components/LinePicker";
import { copyPlaybackLog, initPlaybackLog, setPlaybackLog, usePlaybackLog } from "../playbackDiagnostics";
import { IBack, IBoltF, IBroom, IChevR, IHeart, IInfo, ILink, ILockF, IMoon, IRefresh, ISettings, ISun, IVolMute } from "../icons";

/* 独立设置页：线路 / 外观 / 播放 / 本地数据 / 清理缓存 / 网络诊断 / 关于
   入口：Windows 侧栏「Settings」、Android「Profile」右上角齿轮 */
export default function Settings({ onBack, wide }: { onBack: () => void; wide: boolean }) {
  const { theme, setTheme, favs, history, muteOnStartup, setMuteOnStartup, strictSecurity, strictSecurityReady, securityPending, cliRelaxed, setStrictSecurity, toast } = useStore();
  const [about, setAbout] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [lineOpen, setLineOpen] = useState(false);
  const [lineBase, setLineBase] = useState("");
  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const playbackLog = usePlaybackLog();
  const [copyingLog, setCopyingLog] = useState(false);

  const readLine = () => {
    api.lineState().then((s) => setLineBase(s.base)).catch(() => {});
  };
  useEffect(readLine, []);
  useEffect(() => { void initPlaybackLog(); }, []);

  const checkUpdate = async () => {
    setChecking(true);
    try {
      const info = await api.checkUpdate();
      if (info.has_update) setUpdate(info);
      else toast(`You have the latest version v${info.current}`, "ok");
    } catch (e) {
      toast((e as Error).message || "Update check failed", "info");
    } finally {
      setChecking(false);
    }
  };

  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <>
      <div className="text-[10.5px] font-semibold text-dim tracking-wide px-1 mt-4 mb-1.5">{title}</div>
      <div className="rounded-(--r-md) bg-s2 divide-y divide-s3">{children}</div>
    </>
  );

  return (
    <div className="absolute inset-0 bg-bg flex flex-col">
      <div className="shrink-0 relative overflow-hidden bg-s1" style={{ paddingTop: "var(--sat, 0px)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(90% 120% at 100% 0%, var(--p-pc) 0%, transparent 60%)", opacity: 0.32 }} />
        <div className="relative px-3 pt-2 pb-4">
          <button onClick={onBack} aria-label="Back" className="w-10 h-10 rounded-full flex items-center justify-center text-on hover:bg-s3 pressable"><IBack size={20} /></button>
          <div className="px-2 mt-1 flex items-end justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-(--r-sm) bg-pc text-on-pc flex items-center justify-center"><ISettings size={20} strokeWidth={1.7} /></span>
                <span className="text-[24px] font-bold tracking-wide text-on">Settings</span>
              </div>
              <div className="text-[11px] text-mut mt-1">Appearance · Play · Local data · Diagnostics</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 scroll-y px-4 pt-1 pb-10">
        <div className={wide ? "max-w-[720px] mx-auto" : ""}>
          <Section title="Appearance">
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary">{theme === "dark" ? <IMoon size={16} /> : <ISun size={16} />}</span>
              <div className="flex-1">
                <div className="text-[12.5px] text-on">Dark mode</div>
                <div className="text-[10.5px] text-mut">Fluent dark appearance</div>
              </div>
              <Toggle on={theme === "dark"} onChange={(on) => setTheme(on ? "dark" : "light")} label="Dark mode" />
            </div>
          </Section>

          <Section title="Play">
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><IVolMute size={16} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] text-on">Mute on startup</div>
                <div className="text-[10.5px] text-mut">Starts muted by default. Turn this off to restore your previous mute setting at launch.</div>
              </div>
              <Toggle on={muteOnStartup} onChange={setMuteOnStartup} label="Mute on startup" />
            </div>
          </Section>

          <Section title="Local data">
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><IHeart size={16} /></span>
              <div className="flex-1">
                <div className="text-[12.5px] text-on">Local likes</div>
                <div className="text-[10.5px] text-mut">{favs.length} favorites · {history.length} history entries</div>
              </div>
            </div>
            <button onClick={() => setClearOpen(true)} className="w-full flex items-center gap-3 px-3.5 py-3 text-left pressable">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><IBroom size={16} /></span>
              <div className="flex-1">
                <div className="text-[12.5px] text-on">Clear cache</div>
                <div className="text-[10.5px] text-mut">Cover and playback cache, plus local history</div>
              </div>
              <IChevR size={15} className="text-mut" />
            </button>
          </Section>

          <Section title="Network">
            <button onClick={() => setLineOpen(true)} className="w-full flex items-center gap-3 px-3.5 py-3 text-left pressable">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><IBoltF size={16} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] text-on">Servers</div>
                <div className="text-[10.5px] text-mut truncate">{lineBase ? hostOf(lineBase) : "Fixed servers 1（Default）"}</div>
              </div>
              <IChevR size={15} className="text-mut" />
            </button>
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><ILockF size={15} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] text-on">Strict security mode</div>
                <div className="text-[10.5px] text-mut">
                  {cliRelaxed
                    ? "已由启动参数 --no-strict 切换为Compatibility mode；可手动重新开启"
                    : "Default开启，防上游投毒与内网探测；若导致正文或特殊Proxy异常可Close（或用 --no-strict 启动）"}
                </div>
              </div>
              <Toggle
                on={strictSecurity}
                disabled={!strictSecurityReady || securityPending}
                onChange={(on) => {
                  void setStrictSecurity(on).then(() => {
                    toast(on ? "Strict security mode enabled" : "Compatibility mode enabled", "info");
                  }).catch(() => toast("Could not save security settings. The previous mode is still active.", "info"));
                }}
                label="Strict security mode"
              />
            </div>
            {/* 打不开时先点这里：把 DNS / 代理 / HTTP 结果复制给维护者 */}
            <button onClick={async () => {
              try {
                const text = JSON.stringify(await api.netDiag(), null, 2);
                logLine(`[net_diag] ${text}`);
                await navigator.clipboard?.writeText(text);
                toast("Network diagnostics copied", "ok");
              } catch (e) {
                toast((e as Error).message || "Diagnostics failed", "info");
              }
            }} className="w-full flex items-center gap-3 px-3.5 py-3 text-left pressable">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><ILink size={16} /></span>
              <div className="flex-1">
                <div className="text-[12.5px] text-on">Network diagnostics</div>
                <div className="text-[10.5px] text-mut">Test DNS / System proxy / Official site connectivity</div>
              </div>
              <IChevR size={15} className="text-mut" />
            </button>
          </Section>

          <Section title="Playback diagnostics">
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><IInfo size={16} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] text-on">Playback diagnostic logs</div>
                <div className="text-[10.5px] text-mut">记录点击、拖动、切页和缓冲过程；复现问题后可Close并Copy日志</div>
                {playbackLog.error && <div role="alert" className="text-[10.5px] text-danger">{playbackLog.error}</div>}
              </div>
              <Toggle label="Playback diagnostic logs" on={playbackLog.enabled} disabled={!playbackLog.ready || playbackLog.pending}
                onChange={(on) => { void setPlaybackLog(on).then(() => toast(on ? "已开启Playback diagnostics，请复现问题" : "已ClosePlayback diagnostics，已有日志保留", "ok")).catch(() => toast("Could not save logging settings. Try again.", "info")); }} />
            </div>
            <button disabled={!playbackLog.ready || playbackLog.pending || copyingLog} onClick={async () => {
              setCopyingLog(true);
              try { await copyPlaybackLog(); toast("Playback diagnostic logs copied", "ok"); }
              catch (e) { toast((e as Error).message || "Could not copy logs", "info"); }
              finally { setCopyingLog(false); }
            }} className="w-full flex items-center gap-3 px-3.5 py-3 text-left pressable disabled:opacity-60">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><ILink size={16} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] text-on">{copyingLog ? "Copying...…" : "CopyPlayback diagnostic logs"}</div>
                <div className="text-[10.5px] text-mut break-all">{playbackLog.path || "Logs are stored on this device only"}</div>
              </div>
              <IChevR size={15} className="text-mut" />
            </button>
          </Section>

          <Section title="Other">
            <button onClick={checkUpdate} disabled={checking} className="w-full flex items-center gap-3 px-3.5 py-3 text-left pressable disabled:opacity-60">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><IRefresh size={16} /></span>
              <div className="flex-1">
                <div className="text-[12.5px] text-on">Check for updates</div>
                <div className="text-[10.5px] text-mut">{checking ? "Checking...…" : `Current v${APP_VERSION} · Compare with the GitHub release`}</div>
              </div>
              <IChevR size={15} className="text-mut" />
            </button>
            <button onClick={() => setAbout(true)} className="w-full flex items-center gap-3 px-3.5 py-3 text-left pressable">
              <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><IInfo size={16} /></span>
              <div className="flex-1">
                <div className="text-[12.5px] text-on">About HGhub</div>
                <div className="text-[10.5px] text-mut">Version {APP_VERSION} · Noncommercial use only</div>
              </div>
              <IChevR size={15} className="text-mut" />
            </button>
          </Section>

          <div className="text-center text-[10px] text-dim mt-5">HGhub {APP_VERSION} · {platform === "android" ? "Android" : platform === "ios" ? "iOS" : platform === "macos" ? "macOS" : platform === "linux" ? "Linux" : "Windows"} client</div>
        </div>
      </div>

      <LinePicker open={lineOpen} onClose={() => { setLineOpen(false); readLine(); }} />

      <Modal open={about} onClose={() => setAbout(false)} width={392}>
        <div className="p-5">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-(--r-sm) brand-grad glow-neon flex items-center justify-center text-on-primary text-[17px] font-black">H</span>
            <div>
              <div className="text-[16px] font-bold text-on leading-tight">HGhub</div>
              <div className="text-[11px] text-mut mt-0.5">YellowFruit Short Dramas · Third-party client v{APP_VERSION}</div>
            </div>
          </div>

          <p className="text-[12px] text-on/70 leading-relaxed mt-4">
            基于 Rust + Tauri 2 构建的跨平台客户端，支持 Windows、macOS、Android 与 Linux。
            界面遵循 Fluent 设计语言，Play器采用沉浸式竖屏信息流。
          </p>

          <div className="mt-4 rounded-(--r-sm) bg-s3/60 p-3 text-[11px] text-mut leading-relaxed">
            本项目仅供学习与交流，所有内容均来自上游站点，客户端不存储、不分发任何视频内容。
            请于 24 小时内删除相关资源，并支持正版。
          </div>

          <div className="mt-4 divide-y divide-s3">
            <button onClick={() => { navigator.clipboard?.writeText("https://github.com/Minireel/HGhub").then(() => toast("Repository link copied", "ok")).catch(() => {}); }}
              className="w-full flex items-center gap-2 py-2.5 text-left pressable">
              <ILink size={15} className="text-mut" />
              <span className="text-[12px] text-on/85">github.com/Minireel/HGhub</span>
              <span className="ml-auto text-[10.5px] text-primary">Copy</span>
            </button>
            <button onClick={() => { navigator.clipboard?.writeText("https://huangguoai.com").then(() => toast("Website link copied", "ok")).catch(() => {}); }}
              className="w-full flex items-center gap-2 py-2.5 text-left pressable">
              <ILink size={15} className="text-mut" />
              <span className="text-[12px] text-on/85">huangguoai.com</span>
              <span className="ml-auto text-[10.5px] text-primary">Copy</span>
            </button>
            <div className="flex items-center gap-2 py-2.5">
              <IInfo size={15} className="text-mut" />
              <span className="text-[12px] text-on/85">PolyForm Noncommercial 1.0.0</span>
              <span className="ml-auto text-[10.5px] text-mut">Noncommercial only</span>
            </div>
          </div>

          <button onClick={() => setAbout(false)} className="mt-4 w-full h-9 rounded-(--r-ctl) bg-s3 text-[12.5px] text-on pressable">Got it</button>
        </div>
      </Modal>

      <Modal open={clearOpen} onClose={() => setClearOpen(false)} width={330}>
        <div className="p-5">
          <div className="text-[14.5px] font-bold text-on">Clear cache</div>
          <p className="text-[12px] text-mut leading-relaxed mt-2">
            Clear cached covers and playlists. Favorites, watch history, search history, and sign-in status are kept.
          </p>
          <div className="flex gap-2 mt-5">
            <button onClick={() => setClearOpen(false)} className="flex-1 h-9 rounded-(--r-ctl) bg-s3 text-[12.5px] text-on/80 pressable">Cancel</button>
            <button disabled={clearing} onClick={async () => {
              setClearing(true);
              try { await api.clearCache(); } catch { /* Ignore */ }
              setClearing(false);
              setClearOpen(false);
              toast("Cache cleared", "ok");
            }} className="flex-1 h-9 rounded-(--r-ctl) bg-primary text-[12.5px] font-semibold text-on-primary pressable disabled:opacity-60">
              {clearing ? "Clearing...…" : "Clear cache"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!update?.has_update} onClose={() => setUpdate(null)} width={392}>
        <div className="p-5">
          <div className="text-[15px] font-bold text-on">Update available</div>
          <p className="text-[11.5px] text-mut mt-1.5">
            v{update?.current} → <b className="text-on">v{update?.latest}</b>
            {update?.published_at ? ` · ${update.published_at.slice(0, 10)}` : ""}
          </p>
          {!!update?.notes && (
            <div className="mt-3 max-h-[180px] scroll-y rounded-(--r-sm) bg-s2 p-3 text-[11px] text-mut whitespace-pre-wrap leading-relaxed">{update.notes}</div>
          )}
          <div className="flex gap-2 mt-4">
            <button onClick={() => setUpdate(null)} className="flex-1 h-9 rounded-(--r-ctl) bg-s3 text-[12.5px] text-on/80 pressable">Later</button>
            <button onClick={() => {
              if (!update) return;
              api.openUrl(update.url).catch(() => {
                navigator.clipboard?.writeText(update.url).then(() => toast("Download link copied", "ok")).catch(() => {});
              });
            }} className="flex-1 h-9 rounded-(--r-ctl) bg-primary text-[12.5px] font-semibold text-on-primary pressable">Download</button>
          </div>
          <div className="text-[10px] text-dim mt-2.5 break-all">{update?.url}</div>
        </div>
      </Modal>
    </div>
  );
}
