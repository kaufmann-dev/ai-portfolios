<script lang="ts">
	import { formatSignedMoney, formatSignedPct, toneClass } from '$lib/format';

	let { value, kind = 'pct' }: { value: number; kind?: 'pct' | 'money' } = $props();
</script>

<span class={['tabular', toneClass(value)]}>
	{kind === 'pct' ? formatSignedPct(value) : formatSignedMoney(value)}
</span>
