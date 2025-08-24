import React from 'react'
import { useBuild } from '../lib/buildContext'
import { gql, useQuery } from '@apollo/client'

const CAREER_ENUM_QUERY = gql`
  query CareerEnum {
    __type(name: "Career") {
      enumValues { name }
    }
  }
`

export default function Toolbar() {
  const { state, setCareer, setCareerRank, setRenownRank, reset } = useBuild()

  return (
    <div className="toolbar">
      <div className="toolbar-panel">
        <h3>Character</h3>
        <div className="toolbar-controls">
          <CareerSelect setCareer={setCareer} value={state.careerId ?? ''} />

        <div className="control-row">
          <label htmlFor="career-rank" className="control-label slot-name">Level</label>
          <input
            id="career-rank"
            type="number"
            min={1}
            max={40}
            value={state.careerRank}
            onChange={(e) => setCareerRank(Number(e.target.value))}
          />
        </div>

        <div className="control-row">
          <label htmlFor="renown-rank" className="control-label slot-name">Renown</label>
          <input
            id="renown-rank"
            type="number"
            min={1}
            max={255}
            value={state.renownRank}
            onChange={(e) => setRenownRank(Number(e.target.value))}
          />
        </div>

        <button onClick={reset} className="reset-button">Reset</button>
        </div>
      </div>
    </div>
  )
}

function CareerSelect({ setCareer, value }: { setCareer: (id?: string) => void; value: string }) {
  const { data, loading, error } = useQuery(CAREER_ENUM_QUERY)

  if (loading) {
    return (
      <div className="control-row">
        <label htmlFor="career-select" className="control-label slot-name">Career</label>
        <select id="career-select" disabled>
          <option>Loading…</option>
        </select>
      </div>
    )
  }

  if (error || !data?.__type?.enumValues) {
    return (
      <div className="control-row">
        <label htmlFor="career-select" className="control-label slot-name">Career</label>
        <select id="career-select" onChange={(e) => setCareer(e.target.value)} value={value}>
          <option value="">-- unavailable --</option>
        </select>
      </div>
    )
  }

  const items: string[] = data.__type.enumValues.map((v: any) => v.name).sort((a: string, b: string) => a.localeCompare(b))

  return (
    <div className="control-row">
      <label htmlFor="career-select" className="control-label slot-name">Career</label>
      <select id="career-select" onChange={(e) => setCareer(e.target.value)} value={value}>
        <option value="">-- select --</option>
        {items.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  )
}
