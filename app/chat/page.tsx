'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { uiTokens } from '../../components/ui/System'
import { CHAT_CONSENT_STORAGE_KEY, PUBLIC_CHAT_CHANNEL } from '../../lib/privacyConfig'

type ChatMessage = {
	role: 'user' | 'assistant'
	content: string
}

const PRIVACY_NOTICE =
	'Bitte geben Sie keine sensiblen personenbezogenen Daten ein. Die Inhalte koennen zur Verarbeitung an externe Dienste uebertragen werden.'

const UNCERTAINTY_NOTICE =
	'Ich unterstuetze Sie bei Fragen rund um Ihr Tier und unsere Praxis. Bitte beachten Sie, dass einzelne Informationen unvollstaendig oder nicht ganz korrekt sein koennen.'

const isUncertainReply = (text: string) => {
	const value = text.toLowerCase()
	return [
		'nicht sicher',
		'unsicher',
		'unklar',
		'moeglicherweise',
		'vermutlich',
		'koennte',
		'kann ich nicht eindeutig',
	].some((needle) => value.includes(needle))
}

export default function ChatPage(){

const [messages,setMessages] = useState<ChatMessage[]>([])
const [input,setInput] = useState("")
const [loading,setLoading] = useState(false)
const [consentAccepted, setConsentAccepted] = useState(false)
const [consentReady, setConsentReady] = useState(false)

useEffect(() => {
	const stored = localStorage.getItem(CHAT_CONSENT_STORAGE_KEY)
	setConsentAccepted(stored === '1')
	setConsentReady(true)
}, [])

const enableConsent = () => {
	localStorage.setItem(CHAT_CONSENT_STORAGE_KEY, '1')
	setConsentAccepted(true)
}

const canSend = consentAccepted && !loading && input.trim().length > 0

const assistantUncertainty = useMemo(
	() => messages.map((m) => m.role === 'assistant' && isUncertainReply(m.content)),
	[messages],
)

const send = async()=>{

if(!canSend) return

const newMessages: ChatMessage[] = [
...messages,
{ role: 'user', content: input }
]

setMessages(newMessages)
setInput("")
setLoading(true)

try{

const res = await fetch("/api/chat",{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
messages:newMessages,
consentAccepted:true,
channel:PUBLIC_CHAT_CHANNEL
})
})

if (!res.ok || !res.body) {
	const errorText = await res.text()
	throw new Error(errorText || 'Chat-Antwort fehlgeschlagen')
}

const reader = res.body.getReader()
const decoder = new TextDecoder()
let fullText = ''

setMessages([
...newMessages,
{role:"assistant",content:""}
])

while (true) {
	const { done, value } = await reader.read()
	if (done) break
	fullText += decoder.decode(value)

	setMessages((prev) => {
		const updated = [...prev]
		updated[updated.length - 1] = { role: 'assistant', content: fullText }
		return updated
	})
}

if (!fullText.trim()) {
	throw new Error('Leere Antwort vom Modell')
}

}catch{

setMessages([
...newMessages,
{role:"assistant",content:"Fehler bei der VetMind-Verbindung"}
])

}

setLoading(false)

}

return(

<main
style={{
minHeight:'100vh',
background:uiTokens.pageBackground,
display:'flex',
justifyContent:'center',
padding:uiTokens.pagePadding,
fontFamily:'inherit'
}}
>

<div
style={{
width:'100%',
maxWidth:'800px',
background:uiTokens.cardBackground,
borderRadius:uiTokens.radiusCard,
padding:'24px',
border:uiTokens.cardBorder
}}
>


{!consentReady ? null : !consentAccepted ? (
<div
style={{
border: uiTokens.cardBorder,
borderRadius: '12px',
padding: '14px',
background: '#f8fafc',
marginBottom: '16px'
}}
>
<div style={{ fontSize: '14px', color: '#6b7280', lineHeight: 1.5 }}>
{PRIVACY_NOTICE}
</div>
<button
onClick={enableConsent}
style={{
marginTop: '12px',
padding: '10px 14px',
borderRadius: '8px',
border: 'none',
background: uiTokens.brand,
color: 'white',
fontWeight: 700,
cursor: 'pointer'
}}
>
Chat starten
</button>
</div>
) : (
<>
<div style={{ marginBottom: '16px' }}>
<h1
style={{
color:uiTokens.brand,
margin:'0',
fontSize:'32px',
fontWeight:700
}}
>
Tiermedizinischer VetMind Assistent
</h1>
<div style={{ marginTop: '6px', color: uiTokens.textSecondary, fontSize: '14px' }}>
Direkte Chat-Unterstuetzung mit VetMind.
</div>
</div>

<div
style={{
maxHeight:'500px',
overflowY:'auto',
marginBottom:'16px',
display:'grid',
gap:'10px'
}}
>

<div
style={{
fontSize: '12px',
lineHeight: 1.45,
color: '#6b7280',
background: '#f8fafc',
border: '1px solid #e5e7eb',
borderRadius: '10px',
padding: '10px 12px'
}}
>
{PRIVACY_NOTICE}
</div>

{messages.map((m,i)=>(
<div
key={i}
style={{
padding:'12px',
borderRadius:'10px',
border:uiTokens.cardBorder,
background:m.role==="user" ? "#eef6f7" : "#f8fafc"
}}
>

<b>{m.role==="user"?"Du":"VetMind"}:</b>

<div
style={{
marginTop:'6px',
whiteSpace:'pre-wrap'
}}
>
{m.content}
</div>

{assistantUncertainty[i] ? (
<div
style={{
marginTop: '8px',
fontSize: '12px',
lineHeight: 1.45,
color: '#6b7280'
}}
>
{UNCERTAINTY_NOTICE}
</div>
) : null}

</div>
))}

{loading && <div>VetMind schreibt…</div>}

</div>

<input
value={input}
onChange={(e)=>setInput(e.target.value)}
placeholder="Frage stellen..."
disabled={!consentAccepted || loading}
style={{
width:'100%',
padding:'12px',
borderRadius:'10px',
border:uiTokens.cardBorder
}}
/>

<button
onClick={send}
disabled={!canSend}
style={{
marginTop:'12px',
padding:'12px 16px',
borderRadius:'8px',
border:'none',
background:uiTokens.brand,
color:'white',
fontWeight:700,
cursor:canSend ? 'pointer' : 'not-allowed',
opacity: canSend ? 1 : 0.6
}}
>
Senden
</button>

</>
)}

<div style={{marginTop:'20px'}}>

<Link href="/">
← zurueck zum VetMind Assistenten

</Link>

</div>

</div>

</main>

)

}
