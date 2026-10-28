/**
 * A labelled range slider with a value readout and min/max captions — the
 * filter sidebar's "max price" control, pulled out of Explorer.jsx so any
 * screen with a numeric-range filter can reuse it instead of re-building
 * the label/value/track/caption block by hand.
 *
 * The track stays a native <input type="range"> — fully re-skinned via the
 * ::-webkit-slider-track/thumb and ::-moz-range-track/thumb rules in
 * styles.css, not a from-scratch custom control — with the filled portion
 * passed down here as the --range-fill CSS custom property, since React
 * can't target a browser-internal pseudo-element directly to set its
 * background per instance.
 */
export function RangeField({ label, value, valueLabel, min, max, step, minLabel, maxLabel, onChange }) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const fill = `linear-gradient(to right, var(--color-primary) ${pct}%, var(--color-sunken) ${pct}%)`;

  return (
    <label className="block">
      <span className="flex justify-between text-sm font-semibold">
        {label}
        <span className="tabular-nums text-primary">{valueLabel}</span>
      </span>
      <input
        className="mt-3"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ "--range-fill": fill }}
      />
      <span className="mt-1 flex justify-between text-xs text-muted">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </span>
    </label>
  );
}
