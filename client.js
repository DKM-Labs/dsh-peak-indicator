window.__ModuleLoader__.load({
  id: '@dkm-labs/dsh-peak-indicator',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // DeepSeek bills API tokens on two price tiers (dates per the official
    // DeepSeek pricing page, checked 2026-11-18):
    //   peak     = weekdays 09:00–12:00 and 14:00–18:00 Beijing time,
    //              excluding Chinese public holidays;
    //   off-peak = every other moment, at 50% of the peak price.
    // Weekends and Chinese public holidays are off-peak all day. The window
    // is defined in Beijing time (UTC+8, no daylight saving), so the check
    // uses a fixed offset instead of the viewer's local time zone.
    const BJ_OFFSET_MS = 8 * 60 * 60 * 1000;
    const PEAK_WINDOWS = [
      [9 * 60, 12 * 60],
      [14 * 60, 18 * 60],
    ];

    // Chinese public holidays that can carry a peak window on a weekday.
    // 2026: 国办发明电〔2025〕7号. 2027: 国办发明电〔2026〕10号.
    // Weekend dates are listed only where they fall inside a holiday block;
    // they are off-peak through the weekend rule either way.
    const CN_HOLIDAYS = new Set([
      '2026-01-01', '2026-01-02', '2026-01-03',
      '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
      '2026-04-04', '2026-04-05', '2026-04-06',
      '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
      '2026-06-19', '2026-06-20', '2026-06-21',
      '2026-09-25', '2026-09-26', '2026-09-27',
      '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07',
      '2027-01-01', '2027-01-02', '2027-01-03',
      '2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-02-10', '2027-02-11', '2027-02-12', '2027-02-13',
      '2027-04-03', '2027-04-04', '2027-04-05',
      '2027-05-01', '2027-05-02', '2027-05-03', '2027-05-04', '2027-05-05',
      '2027-06-09',
      '2027-09-15',
      '2027-10-01', '2027-10-02', '2027-10-03', '2027-10-04', '2027-10-05', '2027-10-06', '2027-10-07',
    ]);

    const pad2 = (value) => String(value).padStart(2, '0');

    /** Beijing wall-clock reading for an absolute instant. */
    function beijingClock(ms) {
      const date = new Date(ms + BJ_OFFSET_MS);
      return {
        weekday: date.getUTCDay(),
        minutes: date.getUTCHours() * 60 + date.getUTCMinutes(),
        dateKey: date.getUTCFullYear() + '-' + pad2(date.getUTCMonth() + 1) + '-' + pad2(date.getUTCDate()),
      };
    }

    /** Whether DeepSeek bills peak rates at this instant. */
    function isPeakAt(ms) {
      const clock = beijingClock(ms);
      if (clock.weekday === 0 || clock.weekday === 6) return false;
      if (CN_HOLIDAYS.has(clock.dateKey)) return false;
      return PEAK_WINDOWS.some(([start, end]) => clock.minutes >= start && clock.minutes < end);
    }

    /** First minute boundary after `ms` whose tier differs, or null within ten days. */
    function nextChangeAt(ms) {
      const current = isPeakAt(ms);
      let cursor = Math.floor(ms / 60000) * 60000 + 60000;
      // Ten days covers the longest Chinese holiday block (National Day, seven
      // days) plus the weekend before the next ordinary weekday.
      const limit = cursor + 10 * 24 * 60 * 60000;
      while (cursor <= limit) {
        if (isPeakAt(cursor) !== current) return cursor;
        cursor += 60000;
      }
      return null;
    }

    function humanDuration(ms) {
      const minutes = Math.max(1, Math.round(ms / 60000));
      const days = Math.floor(minutes / 1440);
      const hours = Math.floor((minutes % 1440) / 60);
      const rest = minutes % 60;
      if (days > 0) return days + 'd ' + hours + 'h';
      if (hours > 0) return hours + 'h ' + pad2(rest) + 'm';
      return rest + 'm';
    }

    function formatLocal(ms) {
      try {
        return new Intl.DateTimeFormat(undefined, {
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(new Date(ms));
      } catch {
        return new Date(ms).toISOString().slice(11, 16) + ' UTC';
      }
    }

    function analyze(ms) {
      const peak = isPeakAt(ms);
      const change = nextChangeAt(ms);
      return {
        peak,
        change,
        remaining: change === null ? null : Math.max(0, change - ms),
      };
    }

    function titleFor(analysis) {
      const peak = analysis.peak;
      const head = peak
        ? 'Peak pricing right now.'
        : 'Off-peak pricing right now.';
      const rule = peak
        ? 'DeepSeek bills peak rates on weekdays 09:00–12:00 and 14:00–18:00 Beijing time (UTC+8), excluding Chinese public holidays.'
        : 'DeepSeek bills off-peak rates outside its peak windows (weekdays 09:00–12:00 and 14:00–18:00 Beijing time (UTC+8), excluding Chinese public holidays). Weekends and holidays are off-peak all day, and the off-peak price is 50% of the peak price.';
      const next = analysis.change === null
        ? 'The next change could not be computed.'
        : (peak ? 'Off-peak starts ' : 'Peak starts ') + formatLocal(analysis.change) + ' your time.';
      return head + ' ' + rule + ' ' + next + (analysis.change === null
        ? ''
        : ' Windows and prices can change; the official DeepSeek pricing page is authoritative. Holiday calendar covered through 2027.');
    }

    function PeakPill() {
      const [now, setNow] = React.useState(() => Date.now());
      React.useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(timer);
      }, []);
      const analysis = analyze(now);
      const label = analysis.peak ? 'Peak' : 'Off-peak';
      const accent = analysis.peak
        ? 'var(--dsw-alias-state-warn-primary)'
        : 'var(--dsw-alias-state-success-primary)';
      const countdown = analysis.remaining === null
        ? null
        : (analysis.peak ? 'off-peak in ' : 'peak in ') + humanDuration(analysis.remaining);
      return h('span', {
        title: titleFor(analysis),
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          whiteSpace: 'nowrap',
          fontSize: 'calc(var(--dsh-content-font-size-secondary, 13px) - 1px)',
          lineHeight: 'calc(20px + var(--dsh-content-font-delta-secondary, 0px))',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--dsw-alias-label-tertiary)',
        },
      },
        h('span', { style: { color: accent } }, label),
        countdown === null ? null : h('span', { style: { color: 'var(--dsw-alias-label-caption)' } }, '·'),
        countdown === null ? null : h('span', null, countdown)
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'dsh-peak-indicator',
          order: 2,
        }, PeakPill));
      },
    };
  },
});
