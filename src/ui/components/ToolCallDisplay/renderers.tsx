import { useState, type FC } from 'react'
import type { ToolRendererProps } from './helpers'
import { str, obj, truncUrl, Badge, KV, Divider } from './helpers'

// ─── Per-Tool Renderers ──────────────────────────────────────────────────────

const ComputerRenderer: FC<ToolRendererProps> = ({ input, result, status }) => {
  const action = input.action as string
  const ref = input.ref as string
  const text = input.text as string
  const coord = input.coordinate as number[] | undefined
  const r = obj(result)

  const actionLabels: Record<string, string> = {
    left_click: 'Click', right_click: 'Right Click', double_click: 'Double Click',
    triple_click: 'Triple Click', type: 'Type', key: 'Key', scroll: 'Scroll',
    scroll_to: 'Scroll To', hover: 'Hover', left_click_drag: 'Drag',
    screenshot: 'Screenshot', zoom: 'Zoom', wait: 'Wait',
  }

  const isScreenshot = action === 'screenshot' || action === 'zoom'
  const dataUrl = r.dataUrl as string | undefined

  return (
    <div className="tool-body">
      <div className="tool-badges">
        <Badge variant="action">{actionLabels[action] || action}</Badge>
        {ref && <Badge>{ref}</Badge>}
        {coord && <Badge>[{coord.join(', ')}]</Badge>}
        {text && action === 'type' && <Badge>"{str(text, 25)}"</Badge>}
        {text && action === 'key' && <Badge>{text}</Badge>}
        {input.scroll_direction && <Badge>{input.scroll_direction as string}</Badge>}
        {action === 'wait' && <Badge>{input.duration || 1}s</Badge>}
        {input.modifiers && <Badge>{input.modifiers as string}</Badge>}
      </div>
      {status === 'completed' && isScreenshot && dataUrl && (
        <img src={dataUrl} alt="Screenshot" className="tool-screenshot" />
      )}
      {status === 'completed' && !isScreenshot && (
        <div className="tool-result-text">
          {r.waited ? `Waited ${r.waited}s` : 'Done'}
        </div>
      )}
    </div>
  )
}

const FormInputRenderer: FC<ToolRendererProps> = ({ input, status }) => (
  <div className="tool-body">
    <div className="tool-badges">
      <Badge>{input.ref as string}</Badge>
      <Badge variant="action">= "{str(input.value, 30)}"</Badge>
    </div>
    {status === 'completed' && <div className="tool-result-text">Done</div>}
  </div>
)

const UploadImageRenderer: FC<ToolRendererProps> = ({ input, status }) => (
  <div className="tool-body">
    <div className="tool-badges">
      <Badge variant="action">{input.imageId as string}</Badge>
      {input.ref && <Badge>{input.ref as string}</Badge>}
      {input.coordinate && <Badge>[{(input.coordinate as number[]).join(', ')}]</Badge>}
    </div>
    {status === 'completed' && <div className="tool-result-text">Uploaded</div>}
  </div>
)

const NavigateRenderer: FC<ToolRendererProps> = ({ input, result, status }) => {
  const url = input.url as string
  const r = obj(result)

  return (
    <div className="tool-body">
      {url === 'back' ? (
        <div className="tool-badges"><Badge variant="action">Back</Badge></div>
      ) : url === 'forward' ? (
        <div className="tool-badges"><Badge variant="action">Forward</Badge></div>
      ) : (
        <div className="tool-url">{url}</div>
      )}
      {status === 'completed' && r.title && (
        <>
          <Divider />
          <KV label="Title" value={str(r.title as string, 60)} />
          {r.url && <div className="tool-url">{truncUrl(r.url as string)}</div>}
        </>
      )}
    </div>
  )
}

const TabsContextRenderer: FC<ToolRendererProps> = ({ result, status }) => {
  const r = obj(result)
  const tabs = (r.tabs as Array<Record<string, unknown>>) || []

  if (status !== 'completed' || tabs.length === 0) return null

  return (
    <div className="tool-body">
      {tabs.slice(0, 10).map((tab, i) => (
        <div key={i} className={`tool-tab-item${tab.active ? ' tool-tab-item--active' : ''}`}>
          <span className="tool-tab-title">{str(tab.title as string, 40)}</span>
          <span className="tool-tab-url">{truncUrl(tab.url as string || '', 40)}</span>
        </div>
      ))}
      {tabs.length > 10 && <div className="tool-result-text">+{tabs.length - 10} more tabs</div>}
    </div>
  )
}

const TabsCreateRenderer: FC<ToolRendererProps> = ({ input, result, status }) => {
  const r = obj(result)
  return (
    <div className="tool-body">
      {input.url && <div className="tool-url">{input.url as string}</div>}
      {status === 'completed' && r.title && (
        <>
          <Divider />
          <KV label="Title" value={str(r.title as string, 60)} />
        </>
      )}
    </div>
  )
}

const ResizeWindowRenderer: FC<ToolRendererProps> = ({ input, result, status }) => {
  const r = obj(result)
  return (
    <div className="tool-body">
      <div className="tool-badges">
        <Badge variant="action">{input.width} x {input.height}</Badge>
      </div>
      {status === 'completed' && (
        <KV label="Result" value={`${r.width} x ${r.height} (${r.state || 'normal'})`} />
      )}
    </div>
  )
}

const WebFetchRenderer: FC<ToolRendererProps> = ({ input, result, status }) => {
  const [showContent, setShowContent] = useState(false)
  const r = obj(result)
  const statusCode = r.status as number | undefined
  const statusVariant = statusCode
    ? statusCode < 300 ? 'success' : statusCode < 400 ? 'warning' : 'error'
    : undefined

  return (
    <div className="tool-body">
      <div className="tool-url">{truncUrl(input.url as string || '')}</div>
      {status === 'completed' && (
        <>
          <Divider />
          <div className="tool-badges">
            {statusCode !== undefined && (
              <Badge variant={statusVariant}>{statusCode} {r.statusText as string}</Badge>
            )}
            {r.contentType && <Badge variant="muted">{str(r.contentType as string, 30)}</Badge>}
          </div>
          {r.content && (
            <>
              <div className="tool-text-preview">
                {showContent
                  ? str(r.content as string, 2000)
                  : str(r.content as string, 200)
                }
              </div>
              {(r.content as string).length > 200 && (
                <button
                  type="button"
                  className="tool-call-toggle"
                  onClick={() => setShowContent(!showContent)}
                >
                  {showContent ? 'Show less' : 'Show more'}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

const ReadPageRenderer: FC<ToolRendererProps> = ({ input, result, status }) => {
  const [showOutput, setShowOutput] = useState(false)
  const r = obj(result)

  return (
    <div className="tool-body">
      <div className="tool-badges">
        <Badge variant="action">{(input.filter as string) || 'all'}</Badge>
        {input.depth && <Badge>depth: {input.depth as number}</Badge>}
        {input.ref_id && <Badge>{input.ref_id as string}</Badge>}
      </div>
      {status === 'completed' && (
        <>
          <Divider />
          {r.tree ? (
            <>
              <div className="tool-text-preview">
                {showOutput
                  ? str(r.tree, 3000)
                  : str(r.tree, 200)
                }
              </div>
              {String(r.tree || '').length > 200 && (
                <button
                  type="button"
                  className="tool-call-toggle"
                  onClick={() => setShowOutput(!showOutput)}
                >
                  {showOutput ? 'Show less' : 'Show more'}
                </button>
              )}
            </>
          ) : (
            <div className="tool-text-preview">{str(result, 200)}</div>
          )}
        </>
      )}
    </div>
  )
}

const GetPageTextRenderer: FC<ToolRendererProps> = ({ result, status }) => {
  const [showFull, setShowFull] = useState(false)
  const r = obj(result)

  if (status !== 'completed') return null

  return (
    <div className="tool-body">
      {r.title && <KV label="Title" value={str(r.title as string, 60)} />}
      {r.url && <div className="tool-url">{truncUrl(r.url as string)}</div>}
      {r.text && (
        <>
          <Divider />
          <div className="tool-text-preview">
            {showFull ? str(r.text as string, 2000) : str(r.text as string, 200)}
          </div>
          {(r.text as string).length > 200 && (
            <button
              type="button"
              className="tool-call-toggle"
              onClick={() => setShowFull(!showFull)}
            >
              {showFull ? 'Show less' : 'Show more'}
            </button>
          )}
        </>
      )}
    </div>
  )
}

const FindRenderer: FC<ToolRendererProps> = ({ input, result, status }) => {
  const r = obj(result)
  const elements = r.elements as Array<Record<string, unknown>> | undefined

  return (
    <div className="tool-body">
      <div className="tool-badges">
        <Badge variant="action">"{str(input.query, 40)}"</Badge>
      </div>
      {status === 'completed' && elements && (
        <>
          <Divider />
          <div className="tool-result-text">
            {elements.length} element{elements.length !== 1 ? 's' : ''} found
          </div>
        </>
      )}
      {status === 'completed' && !elements && (
        <div className="tool-text-preview">{str(result, 200)}</div>
      )}
    </div>
  )
}

const ReadResultRenderer: FC<ToolRendererProps> = ({ input, result, status }) => {
  const [showFull, setShowFull] = useState(false)
  const r = obj(result)

  return (
    <div className="tool-body">
      <div className="tool-badges">
        <Badge variant="action">{input.result_id as string}</Badge>
        {input.offset && <Badge>offset: {input.offset as number}</Badge>}
        {input.limit && <Badge>limit: {input.limit as number}</Badge>}
        {input.pattern && <Badge>/{input.pattern as string}/</Badge>}
      </div>
      {status === 'completed' && (
        <>
          <Divider />
          {r.content ? (
            <>
              {r.totalLines && <KV label="Lines" value={`${r.totalLines}`} />}
              <div className="tool-code">
                {showFull ? str(r.content as string, 3000) : str(r.content as string, 300)}
              </div>
              {String(r.content || '').length > 300 && (
                <button
                  type="button"
                  className="tool-call-toggle"
                  onClick={() => setShowFull(!showFull)}
                >
                  {showFull ? 'Show less' : 'Show more'}
                </button>
              )}
            </>
          ) : (
            <div className="tool-text-preview">{str(result, 200)}</div>
          )}
        </>
      )}
    </div>
  )
}

const ProcessResultRenderer: FC<ToolRendererProps> = ({ input, result, status }) => (
  <div className="tool-body">
    <div className="tool-badges">
      <Badge variant="action">{input.result_id as string}</Badge>
    </div>
    <div className="tool-code">{str(input.code, 200)}</div>
    {status === 'completed' && (
      <>
        <Divider />
        <div className="tool-code">{str(result, 500)}</div>
      </>
    )}
  </div>
)

const ConsoleMessagesRenderer: FC<ToolRendererProps> = ({ input, result, status }) => {
  const r = obj(result)
  const messages = (r.messages as Array<Record<string, unknown>>) || []

  const severityVariant = (type: string) => {
    if (type === 'error' || type === 'exception') return 'error'
    if (type === 'warn' || type === 'warning') return 'warning'
    return 'muted'
  }

  return (
    <div className="tool-body">
      <div className="tool-badges">
        {input.onlyErrors && <Badge variant="error">errors only</Badge>}
        {input.pattern && <Badge>/{input.pattern as string}/</Badge>}
        {input.clear && <Badge variant="warning">clear</Badge>}
      </div>
      {status === 'completed' && (
        <>
          <Divider />
          <KV label="Count" value={`${r.count || messages.length}`} />
          {messages.slice(0, 15).map((msg, i) => (
            <div key={i} className="tool-console-msg">
              <Badge variant={severityVariant(msg.type as string)}>
                {(msg.type as string || 'log').toUpperCase()}
              </Badge>
              <span className="tool-console-msg-text">{str(msg.text as string, 120)}</span>
            </div>
          ))}
          {messages.length > 15 && (
            <div className="tool-result-text">+{messages.length - 15} more messages</div>
          )}
        </>
      )}
    </div>
  )
}

const NetworkRequestsRenderer: FC<ToolRendererProps> = ({ input, result, status }) => {
  const r = obj(result)
  const requests = (r.requests as Array<Record<string, unknown>>) || []

  const statusVariant = (code: number) => {
    if (!code) return 'muted'
    if (code < 300) return 'success'
    if (code < 400) return 'warning'
    return 'error'
  }

  return (
    <div className="tool-body">
      {input.pattern && (
        <div className="tool-badges">
          <Badge>/{input.pattern as string}/</Badge>
        </div>
      )}
      {status === 'completed' && (
        <>
          <Divider />
          <KV label="Count" value={`${r.count || requests.length}`} />
          {requests.slice(0, 15).map((req, i) => (
            <div key={i} className="tool-network-row">
              <Badge variant="action">{(req.method as string) || 'GET'}</Badge>
              {req.status && (
                <Badge variant={statusVariant(req.status as number)}>{req.status as number}</Badge>
              )}
              <span className="tool-network-url">{truncUrl(req.url as string || '', 50)}</span>
            </div>
          ))}
          {requests.length > 15 && (
            <div className="tool-result-text">+{requests.length - 15} more requests</div>
          )}
        </>
      )}
    </div>
  )
}

const JavascriptToolRenderer: FC<ToolRendererProps> = ({ input, result, status }) => {
  const r = obj(result)
  return (
    <div className="tool-body">
      <div className="tool-code">{str(input.code, 300)}</div>
      {status === 'completed' && (
        <>
          <Divider />
          {r.success !== undefined ? (
            <div className="tool-code">{r.result !== undefined ? str(r.result, 500) : 'Success'}</div>
          ) : (
            <div className="tool-code">{str(result, 500)}</div>
          )}
        </>
      )}
    </div>
  )
}

const GifCreatorRenderer: FC<ToolRendererProps> = ({ input, result, status }) => {
  const r = obj(result)

  const actionLabels: Record<string, string> = {
    start_recording: 'Start Recording',
    stop_recording: 'Stop Recording',
    export: 'Export',
    clear: 'Clear',
  }

  return (
    <div className="tool-body">
      <div className="tool-badges">
        <Badge variant="action">{actionLabels[input.action as string] || input.action as string}</Badge>
      </div>
      {status === 'completed' && (
        <>
          <Divider />
          {r.frameCount !== undefined && <KV label="Frames" value={`${r.frameCount}`} />}
          {r.duration !== undefined && <KV label="Duration" value={`${Math.round(r.duration as number / 1000 * 10) / 10}s`} />}
          {r.message && <div className="tool-result-text">{r.message as string}</div>}
        </>
      )}
    </div>
  )
}

const InvokeSkillRenderer: FC<ToolRendererProps> = ({ input, result, status }) => {
  const r = obj(result)

  return (
    <div className="tool-body">
      <div className="tool-badges">
        <Badge variant="action">{input.skill_name as string}</Badge>
      </div>
      {status === 'completed' && (
        <>
          <Divider />
          {r.status === 'error' ? (
            <div className="tool-result-text" style={{ color: 'var(--destructive)' }}>{r.error as string}</div>
          ) : (
            <>
              {r.description && <div className="tool-result-text">{str(r.description as string, 100)}</div>}
              {r.message && <div className="tool-text-preview">{r.message as string}</div>}
            </>
          )}
        </>
      )}
    </div>
  )
}

const UpdatePlanRenderer: FC<ToolRendererProps> = ({ input, result, status }) => {
  const domains = (input.domains as string[]) || []
  const r = obj(result)

  return (
    <div className="tool-body">
      <div className="tool-text-preview">{str(input.approach, 150)}</div>
      {domains.length > 0 && (
        <div className="tool-badges">
          {domains.map((d, i) => <Badge key={i}>{d}</Badge>)}
        </div>
      )}
      {status === 'completed' && r.status && (
        <>
          <Divider />
          <div className="tool-result-text">{r.message as string || 'Plan created'}</div>
        </>
      )}
    </div>
  )
}

// ─── Renderer Registry ───────────────────────────────────────────────────────

export const TOOL_RENDERERS: Record<string, FC<ToolRendererProps>> = {
  computer: ComputerRenderer,
  form_input: FormInputRenderer,
  upload_image: UploadImageRenderer,
  navigate: NavigateRenderer,
  tabs_context: TabsContextRenderer,
  tabs_create: TabsCreateRenderer,
  resize_window: ResizeWindowRenderer,
  web_fetch: WebFetchRenderer,
  read_page: ReadPageRenderer,
  get_page_text: GetPageTextRenderer,
  find: FindRenderer,
  read_result: ReadResultRenderer,
  process_result: ProcessResultRenderer,
  read_console_messages: ConsoleMessagesRenderer,
  read_network_requests: NetworkRequestsRenderer,
  javascript_tool: JavascriptToolRenderer,
  gif_creator: GifCreatorRenderer,
  update_plan: UpdatePlanRenderer,
  invoke_skill: InvokeSkillRenderer,
}
