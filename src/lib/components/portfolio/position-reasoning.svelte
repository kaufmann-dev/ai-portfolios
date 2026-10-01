<script lang="ts">
	import * as Table from '#lib/components/ui/table/index.js';

	let { id, colspan, thesis, exit }: { id: string; colspan: number; thesis: string; exit: string } =
		$props();
</script>

<Table.Row {id} class="hover:bg-transparent">
	<Table.Cell {colspan} class="whitespace-normal">
		<dl
			class="sticky left-2 grid max-w-[min(65ch,calc(100vw-3rem))] gap-x-4 gap-y-2 pl-5 text-sm sm:grid-cols-[auto_1fr]"
		>
			<dt class="text-muted-foreground">Thesis</dt>
			<dd class="wrap-anywhere whitespace-pre-wrap">{thesis}</dd>
			<dt class="text-muted-foreground">Exit plan</dt>
			<dd class="wrap-anywhere whitespace-pre-wrap">{exit}</dd>
		</dl>
	</Table.Cell>
</Table.Row>
