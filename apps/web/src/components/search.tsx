export function Search({
  value = '',
  compact = false,
}: {
  value?: string;
  compact?: boolean;
}) {
  return (
    <form
      className={`search ${compact ? 'compact' : ''}`}
      action="/ara"
      method="get"
      role="search"
    >
      <label htmlFor={compact ? 'q-small' : 'q'} className="sr-only">
        Ne öğrenmek istiyorsun?
      </label>
      <span aria-hidden="true" className="search-icon">
        ⌕
      </span>
      <input
        id={compact ? 'q-small' : 'q'}
        type="search"
        name="q"
        placeholder="Örneğin: YKS ek tercih ne zaman?"
        defaultValue={value}
        maxLength={240}
        required
        autoComplete="off"
      />
      <button type="submit">
        Cevabı bul <span aria-hidden="true">↗</span>
      </button>
    </form>
  );
}
