/**
 * Renders a number as tally marks — groups of five (four strokes + a diagonal
 * slash), the way you'd hand-count. The signature visual of Tallymark.
 *
 * Capped so large counts stay legible: shows up to `maxGroups` groups, so a
 * very-played song doesn't render dozens of strokes. The exact number always
 * appears beside it, so the marks are texture, not the sole source of truth.
 */
export function TallyMarks({ count, muted = false }: { count: number; muted?: boolean }) {
  const maxGroups = 4; // up to 20 strokes shown; counts beyond still show the numeral
  const fullGroups = Math.min(Math.floor(count / 5), maxGroups);
  const remainder = fullGroups < maxGroups ? count % 5 : 0;

  const groups = [];
  for (let g = 0; g < fullGroups; g++) {
    groups.push(
      <span className="group" key={`g${g}`}>
        <i />
        <i />
        <i />
        <i />
        <span className="strike" />
      </span>,
    );
  }
  if (remainder > 0) {
    groups.push(
      <span className="group" key="rem">
        {Array.from({ length: remainder }, (_, i) => (
          <i key={i} />
        ))}
      </span>,
    );
  }

  return <span className={`tally${muted ? ' muted' : ''}`}>{groups}</span>;
}
