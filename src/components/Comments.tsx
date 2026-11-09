import { useState } from 'react';
import { useModel, useStore } from '../data/store.tsx';
import { Button, ErrorText, Textarea, useAction } from './ui.tsx';

const dateFmt = new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function Comments({ birdId, pairingId }: { birdId?: string; pairingId?: string }) {
  const m = useModel();
  const store = useStore();
  const [text, setText] = useState('');
  const { busy, error, run } = useAction();
  const list = (birdId ? m.commentsOfBird.get(birdId) : m.commentsOfPairing.get(pairingId!)) ?? [];

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">Comments</h2>
      <div className="flex gap-2">
        <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment" aria-label="New comment" />
        <Button
          disabled={busy || !text.trim()}
          onClick={() =>
            run(async () => {
              await store.insert('comments', [{ bird_id: birdId ?? null, pairing_id: pairingId ?? null, body: text.trim() }]);
              setText('');
            })
          }
        >
          Add
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
      {list.length === 0 && <p className="text-slate-600 dark:text-slate-400">No comments yet.</p>}
      <ul className="space-y-2">
        {list.map((c) => (
          <li key={c.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex items-start gap-2">
              <p className="flex-1 whitespace-pre-wrap">{c.body}</p>
              <button
                type="button"
                className="min-h-10 min-w-10 rounded-lg text-slate-500"
                aria-label="Delete comment"
                onClick={() => confirm('Delete this comment?') && run(() => store.remove('comments', c.id))}
              >
                ×
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{dateFmt.format(new Date(c.created_at))}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
