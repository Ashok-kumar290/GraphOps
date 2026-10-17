import React from "react";
import { LoaderCircle, Send } from "lucide-react";
import { useWorkspace } from "../../app/WorkspaceContext";
import type { Doc } from "../../shared/contracts";

export function CompanyQuestion() {
  const {data, service, mode, setMode, question, setQuestion, command, busy, selected, inspect, locked, viewOnly, connectionError, walkthrough} = useWorkspace();
  const isQuestion = selected?.question && !selected.diagnostic && selected.target === service && (!walkthrough || selected.id === walkthrough.questionId);
  const events = isQuestion ? data?.events || [] : [];
  const answer = [...events].reverse().find(e => e.kind === "session_finished" && e.role === "company");
  const citations: string[] = Array.isArray(answer?.data.citations) ? answer.data.citations : [];
  const documentCitations: {id:string;revision:string;source:string}[] = Array.isArray(answer?.data.document_citations) ? answer.data.document_citations : [];
  const links = [...documentCitations.map(doc => ({source:doc.source, revision:doc.revision, id:doc.id})),
    ...citations.filter(source => !documentCitations.some(doc => doc.source === source)).map(source => ({source, revision:"", id:""}))];
  const sourceEvidence = (source: string, revision = "", id = "") => {
    const retrieved = [...events].reverse().filter(e => e.kind === "tool").map(e => e.data.result || {});
    const doc = retrieved.flatMap(result => Array.isArray(result.documents) ? result.documents : result.id ? [result] : []).find((d: Doc) => d.source === source && (!revision || d.revision === revision) && (!id || d.id === id));
    // Use the revision captured by the question, even if the company source has since changed.
    if (doc) return {...doc, text_truncated: doc.text_truncated || !!doc.offset || doc.next_offset != null};
    return {source, owners: retrieved.flatMap(result => Array.isArray(result.owners) ? result.owners : []).filter(owner => owner.source === source), answer: answer?.data};
  };
  const working = !!isQuestion && selected?.job === "running";
  return <section className="panel question-box company-question" aria-labelledby="company-question-heading">
    <div className="company-question-heading"><div><span className="eyebrow">START WITH CONTEXT</span><h2 id="company-question-heading">Ask the company agent about {service}</h2></div>
      <label className="question-mode">Execution mode<select value={mode} onChange={e => setMode(e.target.value)} disabled={busy}>
        <option value="llm">Agent LLM</option><option value="scripted">Scripted baseline</option>
      </select></label>
    </div>
    <form onSubmit={e => {e.preventDefault(); void command("/api/questions", {question, mode, service});}}>
      <input value={question} onChange={e => setQuestion(e.target.value)} aria-label="Company question" placeholder="Who owns this service, and what procedure applies?" maxLength={1000} required/>
      <button className="button primary" disabled={busy || !data || locked || viewOnly || !!connectionError || !question.trim()}><Send size={15}/> Ask</button>
    </form>
    {working && <p className="company-answer-state" role="status"><LoaderCircle size={15} className="spin"/> Reading company context and selecting sources…</p>}
    {answer ? <div className="company-answer" aria-label="Saved company answer">
      <div className="company-answer-meta"><strong>Saved answer</strong><span>{selected!.id}</span><span>{answer.data.mode === "llm" ? "Model answer" : "Scripted context"}</span></div>
      <p className="company-answer-text">{answer.data.summary}</p>
      {!!links.length && <div className="company-answer-sources"><h3>Cited source locations</h3>{links.map(link => <button key={link.source+":"+link.revision} onClick={() => {
        inspect("Source retrieved for saved answer", sourceEvidence(link.source,link.revision,link.id));
      }}>{link.source}{link.revision ? " · rev " + link.revision : ""}</button>)}<small>Source locations and explicit document ID/revision pairs were matched to retrieved records. Read the source text to check the answer.</small></div>}
      <button className="answer-evidence" onClick={() => inspect("Saved company answer evidence", answer)}>Inspect answer and session evidence</button>
    </div> : !working && <p className="quiet-note">Ask a question to get a saved answer from this service’s company context. Incident summaries appear in Agent tasks.</p>}
  </section>;
}
