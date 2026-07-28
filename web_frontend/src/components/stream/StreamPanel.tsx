import { useAnalysisStore, type Stage } from '../../store/analysisStore'

interface StageBlockProps {
  title: string
  reasoning: string
  content: string
}

function StageBlock({ title, reasoning, content }: StageBlockProps) {
  return (
    <div className="stage-block">
      <div className="stage-title">{title}</div>
      {reasoning && (
        <details open className="reasoning">
          <summary>思考过程（{reasoning.length} 字）</summary>
          <pre>{reasoning}</pre>
        </details>
      )}
      {content && (
        <details open className="content">
          <summary>撰写回答（{content.length} 字）</summary>
          <pre>{content}</pre>
        </details>
      )}
    </div>
  )
}

export function StreamPanel() {
  const { reasoning, content, phase, error, stage2Files } = useAnalysisStore()
  const stages: { key: Stage; title: string }[] = [
    { key: 'stage1', title: '阶段一 · 市场诊断' },
    { key: 'stage2', title: '阶段二 · 交易决策' },
  ]
  return (
    <div className="stream-panel">
      {stages.map((s) => (
        <StageBlock
          key={s.key}
          title={s.title}
          reasoning={reasoning[s.key]}
          content={content[s.key]}
        />
      ))}
      {stage2Files.length > 0 && (
        <div className="stage-files">策略文件：{stage2Files.join('、')}</div>
      )}
      {error && <div className="stream-error">⚠ {error}</div>}
      <div className="stream-status">
        状态：{phase}
        {phase === 'idle' && '（点击「提交分析」开始）'}
      </div>
    </div>
  )
}
