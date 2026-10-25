import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'

import { TicketChat } from '@/components/TicketChat'
import { supabase } from '@/lib/supabase'

// One job conversation on its own screen, so a message notification (or its
// Reply button) can open it from anywhere: /chat?request=<service request id>.

export default function ChatScreen() {
  const { request } = useLocalSearchParams<{ request?: string }>()
  const [subtitle, setSubtitle] = useState('Job chat')
  const [closed, setClosed] = useState(false)

  useEffect(() => {
    if (!request) return
    let alive = true
    void supabase
      .from('service_requests')
      .select('issue_type, request_type, status')
      .eq('id', request)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return
        setSubtitle(data.issue_type || (data.request_type === 'repair' ? 'Repair' : 'Installation'))
        setClosed(/cancel/i.test(data.status || ''))
      })
    return () => {
      alive = false
    }
  }, [request])

  function close() {
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#050B14' }}>
      <TicketChat
        visible={!!request}
        requestId={request ?? null}
        title="Messages"
        subtitle={subtitle}
        closed={closed}
        onClose={close}
      />
    </View>
  )
}
