export type BackdropMood = "calm" | "focus" | "celebrate" | "scan";

/**
 * The ambient world behind every screen: glows in the default profile's color
 * (`--world`), an aurora, a grid, and film grain. Moods are tuned in backdrop.css.
 */
export function Backdrop({ mood }: { mood: BackdropMood }) {
  return (
    <div className="backdrop" data-mood={mood} aria-hidden="true">
      <div className="backdrop__aurora" />
      <div className="backdrop__glow backdrop__glow--world" />
      <div className="backdrop__glow backdrop__glow--cyan" />
      <div className="backdrop__glow backdrop__glow--deep" />
      <div className="backdrop__grid" />
      <div className="backdrop__noise" />
      <div className="backdrop__vignette" />
    </div>
  );
}
