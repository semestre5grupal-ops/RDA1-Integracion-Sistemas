/** Spinner pequeño para botones de vuelos (hereda el color del texto). */
export function SpinnerVuelos({ tam = 16 }) {
  return (
    <>
      <style>{`@keyframes sv-giro{to{transform:rotate(360deg)}}@media (prefers-reduced-motion: reduce){.sv-spin{animation-duration:2.4s!important}}`}</style>
      <span
        className="sv-spin"
        aria-hidden="true"
        style={{
          display: 'inline-block', width: tam, height: tam, borderRadius: '50%',
          border: '2px solid currentColor', borderRightColor: 'transparent',
          animation: 'sv-giro .7s linear infinite', verticalAlign: '-3px', marginRight: 8,
        }}
      />
    </>
  );
}
