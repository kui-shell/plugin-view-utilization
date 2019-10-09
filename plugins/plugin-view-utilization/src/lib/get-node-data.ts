/*
 * Copyright 2019 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Commands, REPL, Tables } from '@kui-shell/core'

import { fromTime, default as parseAsSize } from './parse-as-size'

function parse(data: string, nodeLabel: string, context: string, raw = false): Tables.Table {
  const header = {
    name: 'Node',
    attributes: [
      { value: 'CPU' },
      { value: 'Memory' }
    ]
  }

  const body = data.split(/\n/).map(line => {
    const [name, cpu, memory ] = line.split(/\t/)

    const row: Tables.Row = {
      name,
      onclick: `kubectl ${context} get node ${nodeLabel} ${name} -o yaml`,
      attributes: [
        { key: 'cpu', value: raw ? cpu : parseAsSize(cpu) },
        { key: 'memory', value: raw ? memory : parseAsSize(memory) }
      ]
    }

    return row
  })

  return {
    title: 'Nodes',
    header,
    body
  }
}

export default async function getNodeData(options: Commands.ParsedOptions, raw = false): Promise<Tables.Table> {
  const nodeOption = options.l || options.selector || options.label
  const nodeLabel = nodeOption ? `-l ${nodeOption}` : ''

  const context = options.context ? `--context ${options.context}` : ''

  const TAB = `{'\\\\t'}`
  const NEWLINE = `{'\\\\n'}`
  const namePart = '{range .items[*]}{.metadata.name}'
  const cpuPart = '{.status.allocatable.cpu}'
  const memoryPart = '{.status.allocatable.memory}'

  const cmd = `kubectl ${context} get nodes ${nodeLabel} --field-selector=spec.unschedulable=false -o=jsonpath=${namePart}${TAB}${cpuPart}${TAB}${memoryPart}${NEWLINE}{end}`

  return parse(await REPL.rexec<string>(cmd), nodeLabel, context, raw)
}
