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

import * as bytes from 'bytes-iec'
import { format as sprintf } from 'util'
import { Commands, Tables } from '@kui-shell/core'

import getPodData from './get-pod-data'
import getNodeData from './get-node-data'
import { fromTime, fromSize } from './parse-as-size'

function sumTime(table: Tables.Table, attrIdx: number): number {
  return table.body.reduce((sum, _) => sum + fromTime(_.attributes[attrIdx].value), 0)
}

function sumSize(table: Tables.Table, attrIdx: number): number {
  return table.body.reduce((sum, _) => sum + fromSize(_.attributes[attrIdx].value), 0)
}

function calc_percentage(a: number, b: number): string {
  if ( a > 0 && b > 0 ) {
    return (a * 100 / b).toFixed(2) + '%'
  } else if ( b > 0 ) {
        return '0%'
  } else {
    return 'Err'
  }
}

function cpu_pretty(sum: number): string {
  if (sum < 10000) {
    return sprintf("%f", sum / 1000)
  } else {
    return sprintf("%d", sum / 1000)
  }
}

function mem_pretty(sum: number): string {
  return bytes(sum, {})
}

function calc_sched(requests: number, allocatable: number): number {
  if ( allocatable>= requests ) {
    return (allocatable - requests)
  } else {
    return 0
  }
}

function calc_free(requests: number, limits: number, allocatable: number): number {
  const total_used=(limits > requests)? limits : requests
  if ( allocatable > total_used ) {
    return (allocatable - total_used)
  } else {
    return 0
  }
}

function format(nodes: Tables.Table, pods: Tables.Table): Tables.Table {
  const alloc_cpu = sumTime(nodes, 0)
  const alloc_mem = sumSize(nodes, 1)
  const req_cpu = sumTime(pods, 3)
  const req_mem = sumSize(pods, 4)
  const lim_cpu = sumTime(pods, 5)
  const lim_mem = sumSize(pods, 6)
  
  const req_cpu_text = cpu_pretty(req_cpu)
  const req_mem_text = mem_pretty(req_mem)
  const req_header = 'Requests'
  // const req_width=calc_max_width(req_header, req_cpu_text, req_mem_text)

  const percent_req_cpu_text = calc_percentage(req_cpu, alloc_cpu)
  const percent_req_mem_text=calc_percentage(req_mem, alloc_mem)
  const percent_req_header = '%Requests'
  // const percent_req_width=calc_max_width(percent_req_header, percent_req_cpu_text, percent_req_mem_text)

  const lim_cpu_text=cpu_pretty(lim_cpu)
  const lim_mem_text=mem_pretty(lim_mem)
  const lim_header='Limits'
  // const lim_width=calc_max_width(lim_header, lim_cpu_text, lim_mem_text)

  const percent_lim_cpu_text=calc_percentage(lim_cpu, alloc_cpu)
  const percent_lim_mem_text=calc_percentage(lim_mem, alloc_mem)
  const percent_lim_header='%Limits'
  //const percent_lim_width=calc_max_width(percent_lim_header, percent_lim_cpu_text, percent_lim_mem_text)

  const alloc_cpu_text= cpu_pretty(alloc_cpu)
  const alloc_mem_text=mem_pretty(alloc_mem)
  const alloc_header='Allocatable'
  //const alloc_width=calc_max_width(alloc_header, alloc_cpu_text, alloc_mem_text)

  const sched_cpu_text=cpu_pretty(calc_sched(req_cpu, alloc_cpu))
  const sched_mem_text=mem_pretty(calc_sched(req_mem, alloc_mem))
  const sched_header='Schedulable'
  // const sched_width=calc_max_width(sched_header, sched_cpu_text, sched_mem_text)

  const free_cpu_text=cpu_pretty(calc_free(req_cpu, lim_cpu, alloc_cpu))
  const free_mem_text=mem_pretty(calc_free(req_mem, lim_mem, alloc_mem))
  // const free_width=calc_max_width("Free", free_cpu_text, free_mem_text)

  const cpuRow = {
    name: 'CPU',
    attributes: [
      { value: req_cpu_text },
      { value: percent_req_cpu_text },
      { value: lim_cpu_text },
      { value: percent_lim_cpu_text },
      { value: alloc_cpu_text },
      { value: sched_cpu_text },
      { value: free_cpu_text }
    ]
  }
  const memRow = {
    name: 'Memory',
    attributes: [
      { value: req_mem_text },
      { value: percent_req_mem_text },
      { value: lim_mem_text },
      { value: percent_lim_mem_text },
      { value: alloc_mem_text },
      { value: sched_mem_text },
      { value: free_mem_text }
    ]
  }
  return {
    header: {
      name: 'Resource',
      attributes: [
        { value: req_header },
        { value: percent_req_header },
        { value: lim_header },
        { value: percent_lim_header },
        { value: alloc_header },
        { value: sched_header, },
        { value: 'Free' }
      ]
    },
    body: [
      cpuRow,
      memRow
    ]
  }
}

export async function clusterUtilization({ parsedOptions }: Commands.Arguments): Promise<Tables.Table> {
  const [ nodes, pods ] = await Promise.all([getNodeData(parsedOptions, true), getPodData(parsedOptions, true)])

  return format(nodes, pods)
}

function formatN(nodes: Tables.Table, allPods: Tables.Table): Tables.Table {
  const header = {
    name: 'Node',
    attributes: [
      { value: 'CPU Requests' },
      { value: 'CPU %Requests' },
      { value: 'CPU Limits' },
      { value: 'CPU %Limits' },
      { value: 'Mem Requests' },
      { value: 'Mem %Requests' },
      { value: 'Mem Limits' },
      { value: 'Mem %Limits' }
    ]
  }

  const body = nodes.body.map(node => {
    const ip = node.name
    const pods = { body: allPods.body.filter(_ => _.attributes[2].value === ip) }

    const alloc_cpu = fromTime(node.attributes[0].value)
    const alloc_mem = fromSize(node.attributes[1].value)
    const req_cpu = sumTime(pods, 3)
    const req_mem = sumSize(pods, 4)
    const lim_cpu = sumTime(pods, 5)
    const lim_mem = sumSize(pods, 6)
    console.error('!!!!!!', alloc_cpu, req_cpu, node)

    const req_cpu_text=cpu_pretty(req_cpu)
    const req_mem_text=mem_pretty(req_mem)
    const lim_cpu_text=cpu_pretty(lim_mem)
    const lim_mem_text=mem_pretty(lim_cpu)

    const percent_req_cpu_text=calc_percentage(req_cpu, alloc_cpu)
    const percent_req_mem_text=calc_percentage(req_mem, alloc_mem)

    const percent_lim_cpu_text=calc_percentage(lim_cpu, alloc_cpu)
    const percent_lim_mem_text=calc_percentage(lim_mem, alloc_mem)

    const percent_lim_cpu_graph=calc_percentage(lim_cpu, alloc_cpu)
    const percent_lim_mem_graph=calc_percentage(lim_mem, alloc_mem)
    const percent_lim_cpu_graph_input=percent_lim_cpu_graph
    const percent_lim_mem_graph_input=percent_lim_mem_graph

    return {
      name: node.name,
      attributes: [
        { value: req_cpu_text },
        { value: percent_req_cpu_text },
        { value: lim_cpu_text },
        { value: percent_lim_cpu_text },
        { value: req_mem_text },
        { value: percent_req_mem_text },
        { value: lim_mem_text },
        { value: percent_lim_mem_text }
      ]
    }
  })

  return {
    header,
    body
  }
}

export async function nodeUtilization({ parsedOptions }: Commands.Arguments): Promise<Tables.Table> {
  const [ nodes, pods ] = await Promise.all([getNodeData(parsedOptions, true), getPodData(parsedOptions, true)])

  return formatN(nodes, pods)
}
