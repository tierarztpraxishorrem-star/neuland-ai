'use client'

import { useState } from 'react'

export default function ChatPage(){

const [messages,setMessages] = useState<any[]>([])
const [input,setInput] = useState("")
const [loading,setLoading] = useState(false)

const send = async()=>{

if(!input.trim()) return

const newMessages = [
...messages,
{role:"user",content:input}
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
messages:newMessages
})
})

const data = await res.json()

setMessages([
...newMessages,
{role:"assistant",content:data.message}
])

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
background:'#F4F7F8',
display:'flex',
justifyContent:'center',
padding:'40px',
fontFamily:'Arial'
}}
>

<div
style={{
width:'100%',
maxWidth:'800px',
background:'#fff',
borderRadius:'20px',
padding:'30px',
border:'1px solid #e5e7eb'
}}
>

<h1
style={{
color:'#0F6B74',
marginBottom:'20px'
}}
>
Tiermedizinischer VetMind Assistent
</h1>

<div
style={{
maxHeight:'500px',
overflowY:'auto',
marginBottom:'20px'
}}
>

{messages.map((m,i)=>(
<div
key={i}
style={{
marginBottom:'14px',
padding:'12px',
borderRadius:'10px',
background:m.role==="user" ? "#eef6f7" : "#f7f7f7"
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

</div>
))}

{loading && <div>VetMind schreibt…</div>}

</div>

<input
value={input}
onChange={(e)=>setInput(e.target.value)}
placeholder="Frage stellen..."
style={{
width:'100%',
padding:'12px',
borderRadius:'8px',
border:'1px solid #ccc'
}}
/>

<button
onClick={send}
style={{
marginTop:'12px',
padding:'12px 16px',
borderRadius:'8px',
border:'none',
background:'#0F6B74',
color:'white',
fontWeight:700,
cursor:'pointer'
}}
>
Senden
</button>

<div style={{marginTop:'20px'}}>

<a href="/">
← zurück zum Assistenten

</a>

</div>

</div>

</main>

)

}
