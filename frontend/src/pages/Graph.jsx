import * as d3 from 'd3'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GitBranch, Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import { getKnowledgeGraph } from '../api'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useUiPreferences } from '../contexts/UiPreferencesContext.jsx'

const LINK_DIST = { INVOLVES: 50, AFFECTS: 70, TRACKS: 60 }

/** 大节点（标的）：更深色 */
const ASSET_FILL = '#1E293B'
/** 小节点语义色：整体调暗 */
const TRADE_BUY = '#15803D'
const TRADE_SELL = '#B91C1C'
const EVENT_FILL = '#B45309'
const SHADOW_STROKE = '#57534E'

/** 未悬停：大节点略深灰、小节点更暗灰 */
const IDLE_ASSET = '#94A3B8'
const IDLE_SMALL = '#B5BCC6'
const IDLE_EDGE_STROKE = '#E2E8F0'

function getNodeFill(d) {
  if (d.type === 'asset') return ASSET_FILL
  if (d.type === 'trade') return d.direction === 'buy' ? TRADE_BUY : TRADE_SELL
  if (d.type === 'event') return EVENT_FILL
  if (d.type === 'shadow') return 'transparent'
  return IDLE_SMALL
}

function idleShapeFill(d) {
  if (d.type === 'shadow') return 'transparent'
  return d.type === 'asset' ? IDLE_ASSET : IDLE_SMALL
}

function idleShapeStroke(d) {
  return d.type === 'shadow' ? IDLE_SMALL : null
}

function parseAssetUuid(nodeId) {
  if (!nodeId || typeof nodeId !== 'string') return null
  if (!nodeId.startsWith('asset_')) return null
  return nodeId.slice('asset_'.length)
}

function tradePriceLabel(node, tr) {
  const raw = node.label || ''
  const m = raw.match(/([\d.]+)\s*[×x]\s*([\d.]+)/i)
  const price = m ? m[1] : ''
  const buy = node.direction === 'buy'
  const prefix = buy ? tr('graph.buyShort') : tr('graph.sellShort')
  return price ? `${prefix} ¥${price}` : truncate(raw, 12)
}

function truncate(s, max) {
  if (!s) return '—'
  const t = String(s).trim()
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

function eventTitleLabel(node) {
  return truncate(node.label || node.title || '事件', 10)
}

function shadowLabel(node) {
  const name = (node.label || '').replace(/\([^)]*\)\s*$/, '').trim() || '标的'
  return `${name}(观望)`
}

function nodeRadius(d) {
  if (d.type === 'asset') return 6
  if (d.type === 'trade') return 3.5
  if (d.type === 'event') return 4
  if (d.type === 'shadow') return 4.5
  return 5
}

function collideRadius(d) {
  if (d.type === 'asset') return 10
  if (d.type === 'trade') return 6
  if (d.type === 'event') return 7
  if (d.type === 'shadow') return 8
  return 6
}

function linkDistance(d) {
  return LINK_DIST[d.type] ?? 90
}

function edgeStroke(d) {
  if (d.type === 'INVOLVES') return { stroke: '#CBD5E0', width: 1.5, dash: null }
  if (d.type === 'AFFECTS') return { stroke: '#E2E8F0', width: 1, dash: '4,4' }
  if (d.type === 'TRACKS') return { stroke: '#E2E8F0', width: 1, dash: '2,4' }
  return { stroke: '#E2E8F0', width: 1, dash: null }
}

function linkEndpoints(d) {
  const sx = typeof d.source === 'object' && d.source ? d.source.x : 0
  const sy = typeof d.source === 'object' && d.source ? d.source.y : 0
  const tx = typeof d.target === 'object' && d.target ? d.target.x : 0
  const ty = typeof d.target === 'object' && d.target ? d.target.y : 0
  return { sx, sy, tx, ty }
}

function incidentNodeIds(nodeId, linkData) {
  const set = new Set([nodeId])
  for (const l of linkData) {
    const s = typeof l.source === 'object' && l.source ? l.source.id : l.source
    const t = typeof l.target === 'object' && l.target ? l.target.id : l.target
    if (s === nodeId) set.add(t)
    if (t === nodeId) set.add(s)
  }
  return set
}

export default function Graph() {
  const { user } = useAuth()
  const { t: tr, theme } = useUiPreferences()
  const userId = user?.id
  const navigate = useNavigate()
  const wrapRef = useRef(null)
  const svgRef = useRef(null)
  const zoomBehaviorRef = useRef(null)
  const hoveredIdRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [rawNodes, setRawNodes] = useState([])
  const [rawEdges, setRawEdges] = useState([])
  const [infoNode, setInfoNode] = useState(null)
  const infoTimerRef = useRef(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    ;(async () => {
      await Promise.resolve()
      if (cancelled) return
      setLoading(true)
      try {
        const r = await getKnowledgeGraph(userId)
        if (!cancelled) {
          setRawNodes(Array.isArray(r.nodes) ? r.nodes : [])
          setRawEdges(Array.isArray(r.edges) ? r.edges : [])
        }
      } catch {
        if (!cancelled) {
          setRawNodes([])
          setRawEdges([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!infoNode) return
    if (infoTimerRef.current) clearTimeout(infoTimerRef.current)
    infoTimerRef.current = window.setTimeout(() => {
      setInfoNode(null)
      infoTimerRef.current = null
    }, 3000)
    return () => {
      if (infoTimerRef.current) clearTimeout(infoTimerRef.current)
    }
  }, [infoNode])

  useEffect(() => {
    if (loading) return
    if (rawNodes.length === 0) return

    const container = wrapRef.current
    const svgEl = svgRef.current
    if (!container || !svgEl) return

    let width = Math.max(container.clientWidth, 400)
    let height = Math.max(container.clientHeight, 480)

    const nodes = rawNodes.map((n) => ({ ...n }))
    const links = rawEdges.map((e) => ({
      source: e.source,
      target: e.target,
      type: e.type,
    }))

    const cx = width / 2
    const cy = height / 2
    nodes.forEach((d, i) => {
      const a = (i / Math.max(nodes.length, 1)) * Math.PI * 2
      const r0 = 22 + (i % 5) * 5
      d.x = cx + Math.cos(a) * r0
      d.y = cy + Math.sin(a) * r0
    })

    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()

    const defs = svg.append('defs')
    const dotFill = theme === 'dark' ? '#3f3f46' : '#F0F0F0'
    const labelFill = theme === 'dark' ? '#e4e4e7' : '#333'
    defs
      .append('pattern')
      .attr('id', 'keefoo-dot-grid')
      .attr('width', 20)
      .attr('height', 20)
      .attr('patternUnits', 'userSpaceOnUse')
      .append('circle')
      .attr('cx', 10)
      .attr('cy', 10)
      .attr('r', 1)
      .attr('fill', dotFill)

    const root = svg
      .attr('width', width)
      .attr('height', height)
      .attr('class', 'block touch-none select-none')

    const bgRect = root
      .append('rect')
      .attr('class', 'graph-bg')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'url(#keefoo-dot-grid)')
      .attr('pointer-events', 'all')

    const zoomG = root.append('g').attr('class', 'zoom-layer')
    const linkG = zoomG.append('g').attr('class', 'links')
    const nodeG = zoomG.append('g').attr('class', 'nodes')

    const linkSel = linkG
      .selectAll('line.graph-edge')
      .data(links, (d, i) => `${d.source}-${d.target}-${i}`)
      .join('line')
      .attr('class', 'graph-edge')
      .attr('stroke-linecap', 'round')
      .attr('opacity', 0.25)
      .attr('stroke', IDLE_EDGE_STROKE)

    const nodeSel = nodeG
      .selectAll('g.node')
      .data(nodes, (d) => d.id)
      .join('g')
      .attr('class', 'node')

    nodeSel.each(function (d) {
      const g = d3.select(this)
      g.selectAll('*').remove()
      const r = nodeRadius(d)
      if (d.type === 'asset') {
        g.append('circle')
          .attr('r', r)
          .attr('fill', idleShapeFill(d))
          .attr('class', 'node-shape')
        g.append('text')
          .attr('x', r + 6)
          .attr('y', 3)
          .attr('font-size', 10)
          .attr('fill', labelFill)
          .attr('opacity', 0)
          .attr('class', 'node-label')
          .text(d.label || d.name || tr('graph.defaultAsset'))
      } else if (d.type === 'trade') {
        g.append('circle')
          .attr('r', r)
          .attr('fill', idleShapeFill(d))
          .attr('class', 'node-shape')
        g.append('text')
          .attr('x', r + 5)
          .attr('y', 2.5)
          .attr('font-size', 9)
          .attr('fill', labelFill)
          .attr('opacity', 0)
          .attr('class', 'node-label')
          .text(tradePriceLabel(d, tr))
      } else if (d.type === 'event') {
        g.append('circle')
          .attr('r', r)
          .attr('fill', idleShapeFill(d))
          .attr('class', 'node-shape')
        g.append('text')
          .attr('x', r + 5)
          .attr('y', 2.5)
          .attr('font-size', 9)
          .attr('fill', labelFill)
          .attr('opacity', 0)
          .attr('class', 'node-label')
          .text(eventTitleLabel(d, tr))
      } else if (d.type === 'shadow') {
        g.append('circle')
          .attr('r', r)
          .attr('fill', 'transparent')
          .attr('stroke', idleShapeStroke(d))
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '4 3')
          .attr('class', 'node-shape')
        g.append('text')
          .attr('x', r + 5)
          .attr('y', 2.5)
          .attr('font-size', 9)
          .attr('fill', labelFill)
          .attr('opacity', 0)
          .attr('class', 'node-label')
          .text(shadowLabel(d, tr))
      }
      g.select('.node-label').attr('pointer-events', 'none')
      g.select('.node-shape').attr('pointer-events', 'all')
    })

    const updateHighlightVisuals = () => {
      const hid = hoveredIdRef.current
      const incident = hid ? incidentNodeIds(hid, links) : null

      linkSel.each(function (d) {
        const line = d3.select(this)
        const s = typeof d.source === 'object' && d.source ? d.source.id : d.source
        const t = typeof d.target === 'object' && d.target ? d.target.id : d.target
        const active = Boolean(hid && (s === hid || t === hid))
        const base = edgeStroke(d)
        if (!hid) {
          line
            .interrupt()
            .transition()
            .duration(200)
            .ease(d3.easeCubicOut)
            .attr('opacity', 0.25)
            .attr('stroke', IDLE_EDGE_STROKE)
            .attr('stroke-width', base.width)
            .attr('stroke-dasharray', null)
          return
        }
        line
          .interrupt()
          .transition()
          .duration(200)
          .ease(d3.easeCubicOut)
          .attr('opacity', active ? 1 : 0.1)
          .attr('stroke', base.stroke)
          .attr('stroke-width', base.width)
        if (base.dash) line.attr('stroke-dasharray', base.dash)
        else line.attr('stroke-dasharray', null)
      })

      nodeSel.each(function (d) {
        const g = d3.select(this)
        const shape = g.select('.node-shape')
        const label = g.select('.node-label')
        if (!hid) {
          g.interrupt()
            .transition()
            .duration(200)
            .ease(d3.easeCubicOut)
            .attr('opacity', 1)
          label
            .interrupt()
            .transition()
            .duration(200)
            .ease(d3.easeCubicOut)
            .attr('opacity', 0)
          shape
            .interrupt()
            .transition()
            .duration(200)
            .ease(d3.easeCubicOut)
            .attr('fill', idleShapeFill(d))
            .attr('stroke', idleShapeStroke(d))
            .attr('stroke-width', d.type === 'shadow' ? 1 : null)
            .attr('stroke-dasharray', d.type === 'shadow' ? '4 3' : null)
          return
        }
        const rel = incident && incident.has(d.id)
        const fade = Boolean(!rel)
        g.interrupt()
          .transition()
          .duration(200)
          .ease(d3.easeCubicOut)
          .attr('opacity', fade ? 0.1 : 1)
        label
          .interrupt()
          .transition()
          .duration(200)
          .ease(d3.easeCubicOut)
          .attr('opacity', rel ? 1 : 0)
        shape.interrupt().transition().duration(200).ease(d3.easeCubicOut)
        if (rel) {
          shape
            .attr('fill', getNodeFill(d))
            .attr('stroke', d.type === 'shadow' ? SHADOW_STROKE : null)
            .attr('stroke-width', d.type === 'shadow' ? 1 : null)
            .attr('stroke-dasharray', d.type === 'shadow' ? '4 3' : null)
        } else {
          shape
            .attr('fill', idleShapeFill(d))
            .attr('stroke', idleShapeStroke(d))
            .attr('stroke-width', d.type === 'shadow' ? 1 : null)
            .attr('stroke-dasharray', d.type === 'shadow' ? '4 3' : null)
        }
      })
    }

    const tick = () => {
      linkSel.each(function (d) {
        const { sx, sy, tx, ty } = linkEndpoints(d)
        d3.select(this).attr('x1', sx).attr('y1', sy).attr('x2', tx).attr('y2', ty)
      })

      nodeSel.attr('transform', (d) => `translate(${d.x},${d.y})`)
    }

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance(linkDistance)
          .strength(0.65),
      )
      .force('charge', d3.forceManyBody().strength(-150))
      .force('center', d3.forceCenter(cx, cy))
      .force('x', d3.forceX(cx).strength(0.15))
      .force('y', d3.forceY(cy).strength(0.15))
      .force('collide', d3.forceCollide().radius((d) => collideRadius(d)))
      .alphaDecay(0.02)
      .velocityDecay(0.35)

    simulation.on('tick', tick)
    updateHighlightVisuals()

    const drag = d3
      .drag()
      .on('start', (event, d) => {
        event.sourceEvent?.stopPropagation()
        if (!event.active) simulation.alphaTarget(0.35).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null
        d.fy = null
      })

    nodeSel.call(drag)

    nodeSel
      .on('mouseenter', (event, d) => {
        event.stopPropagation()
        hoveredIdRef.current = d.id
        updateHighlightVisuals()
      })
      .on('mouseleave', () => {
        hoveredIdRef.current = null
        updateHighlightVisuals()
      })

    const zoom = d3
      .zoom()
      .scaleExtent([0.3, 3])
      .filter((event) => {
        if (event.type === 'wheel') return true
        if (event.type === 'dblclick') return false
        const t = event.target
        if (t && t.closest && t.closest('.node')) return false
        return !event.button
      })
      .on('zoom', (event) => {
        zoomG.attr('transform', event.transform)
      })

    zoomBehaviorRef.current = zoom
    svg.call(zoom)

    bgRect.on('click', () => {
      setInfoNode(null)
    })

    nodeSel.on('click', (event, d) => {
      event.stopPropagation()
      const uuid = parseAssetUuid(d.id)
      if (d.type === 'asset' && uuid) {
        navigate(`/asset/${uuid}`)
        return
      }
      setInfoNode({ ...d })
    })

    const onResize = () => {
      if (!wrapRef.current || !svgRef.current) return
      width = Math.max(wrapRef.current.clientWidth, 400)
      height = Math.max(wrapRef.current.clientHeight, 480)
      const ncx = width / 2
      const ncy = height / 2
      d3.select(svgRef.current).attr('width', width).attr('height', height)
      bgRect.attr('width', width).attr('height', height)
      simulation.force('center', d3.forceCenter(ncx, ncy))
      simulation.force('x', d3.forceX(ncx).strength(0.15))
      simulation.force('y', d3.forceY(ncy).strength(0.15))
      simulation.alpha(0.25).restart()
    }

    const ro = new ResizeObserver(onResize)
    ro.observe(container)

    return () => {
      ro.disconnect()
      hoveredIdRef.current = null
      simulation.stop()
      zoomBehaviorRef.current = null
    }
  }, [loading, rawNodes, rawEdges, navigate, theme, tr])

  const handleZoomIn = () => {
    const svg = d3.select(svgRef.current)
    const z = zoomBehaviorRef.current
    if (!z || !svgRef.current) return
    svg.transition().duration(200).call(z.scaleBy, 1.25)
  }

  const handleZoomOut = () => {
    const svg = d3.select(svgRef.current)
    const z = zoomBehaviorRef.current
    if (!z || !svgRef.current) return
    svg.transition().duration(200).call(z.scaleBy, 0.8)
  }

  const handleResetView = () => {
    const svg = d3.select(svgRef.current)
    const z = zoomBehaviorRef.current
    if (!z || !svgRef.current) return
    svg.transition().duration(300).call(z.transform, d3.zoomIdentity)
  }

  const empty = !loading && rawNodes.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col text-[#1A1A1A] dark:text-zinc-100">
      <header className="mb-6 shrink-0 space-y-2">
        <h1
          className="text-[28px] font-extrabold tracking-tight text-black dark:text-white"
          style={{ fontWeight: 800 }}
        >
          {tr('graph.title')}
        </h1>
        <p className="text-[14px] leading-relaxed text-[#888] dark:text-zinc-500">
          {tr('graph.graphSubtitle')}
        </p>
      </header>

      {loading && (
        <div className="flex flex-1 items-center justify-center py-24 text-[14px] text-[#999] dark:text-zinc-500">
          {tr('graph.loading')}
        </div>
      )}

      {!loading && empty && (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl bg-white py-24 shadow-sm dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-zinc-800">
          <GitBranch className="mb-4 h-14 w-14 text-[#CCC] dark:text-zinc-600" strokeWidth={1.25} aria-hidden />
          <p className="text-[15px] text-[#666] dark:text-zinc-400">{tr('graph.empty')}</p>
        </div>
      )}

      {!loading && !empty && (
        <div className="relative w-full flex-1 overflow-visible">
          <div
            ref={wrapRef}
            className="relative min-h-[calc(100vh-220px)] w-full overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-zinc-900 dark:shadow-none dark:ring-1 dark:ring-zinc-800"
          >
            <svg ref={svgRef} className="h-full w-full" />

            <div className="pointer-events-none absolute inset-0">
              <div className="pointer-events-auto absolute bottom-4 left-4 z-10 flex flex-col gap-2 rounded-xl border border-[#EEE] bg-white/95 p-2 shadow-md backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95">
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="rounded-lg p-2 text-[#333] hover:bg-[#F5F5F5] dark:text-zinc-200 dark:hover:bg-zinc-800"
                  title={tr('graph.zoomIn')}
                  aria-label={tr('graph.zoomIn')}
                >
                  <ZoomIn className="h-5 w-5" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="rounded-lg p-2 text-[#333] hover:bg-[#F5F5F5] dark:text-zinc-200 dark:hover:bg-zinc-800"
                  title={tr('graph.zoomOut')}
                  aria-label={tr('graph.zoomOut')}
                >
                  <ZoomOut className="h-5 w-5" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={handleResetView}
                  className="rounded-lg p-2 text-[#333] hover:bg-[#F5F5F5] dark:text-zinc-200 dark:hover:bg-zinc-800"
                  title={tr('graph.resetView')}
                  aria-label={tr('graph.resetView')}
                >
                  <Maximize2 className="h-5 w-5" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            {infoNode && (
            <div className="pointer-events-auto absolute bottom-4 right-4 z-20 max-w-sm rounded-xl border border-[#EEE] bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#999] dark:text-zinc-500">
                {infoNode.type === 'trade'
                  ? tr('graph.nodeTrade')
                  : infoNode.type === 'event'
                    ? tr('graph.nodeEvent')
                    : infoNode.type === 'shadow'
                      ? tr('graph.nodeShadow')
                      : tr('graph.nodeGeneric')}
              </div>
              <div className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-[#333] dark:text-zinc-300">
                <div>
                  <span className="text-[#999] dark:text-zinc-500">{tr('graph.fieldId')}</span>
                  {infoNode.id}
                </div>
                {infoNode.label != null && (
                  <div>
                    <span className="text-[#999] dark:text-zinc-500">{tr('graph.fieldLabel')}</span>
                    {infoNode.label}
                  </div>
                )}
                {infoNode.code != null && (
                  <div>
                    <span className="text-[#999] dark:text-zinc-500">{tr('graph.fieldCode')}</span>
                    {infoNode.code}
                  </div>
                )}
                {infoNode.direction != null && (
                  <div>
                    <span className="text-[#999] dark:text-zinc-500">{tr('graph.fieldDirection')}</span>
                    {infoNode.direction}
                  </div>
                )}
                {infoNode.impact != null && (
                  <div>
                    <span className="text-[#999] dark:text-zinc-500">{tr('graph.fieldImpact')}</span>
                    {infoNode.impact}
                  </div>
                )}
                {infoNode.shadow_type != null && (
                  <div>
                    <span className="text-[#999] dark:text-zinc-500">{tr('graph.fieldType')}</span>
                    {infoNode.shadow_type}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="mt-3 text-[12px] text-[#999] underline hover:text-[#333] dark:text-zinc-500 dark:hover:text-zinc-300"
                onClick={() => setInfoNode(null)}
              >
                {tr('graph.close')}
              </button>
            </div>
            )}
          </div>

          <aside
            className="absolute left-full top-0 z-10 ml-4 w-[240px] rounded-xl border border-[#EEE] bg-white px-4 py-3 text-[12px] shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
            aria-label={tr('graph.legendTitle')}
          >
            <div className="mb-2 font-semibold text-[#666] dark:text-zinc-400">{tr('graph.legendTitle')}</div>
            <ul className="space-y-2 text-[#555] dark:text-zinc-300">
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-full bg-[#1E293B]" />
                {tr('graph.legendAsset')}
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#15803D]" />
                {tr('graph.legendBuy')}
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#B91C1C]" />
                {tr('graph.legendSell')}
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#B45309]" />
                {tr('graph.legendEvent')}
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full border-2 border-dashed border-[#57534E]" />
                {tr('graph.legendShadow')}
              </li>
            </ul>
            <div className="mt-3 border-t border-[#F0F0F0] pt-2 text-[10px] leading-snug text-[#AAA] dark:border-zinc-800 dark:text-zinc-500">
              {tr('graph.edgeTypes')}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
