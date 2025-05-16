'use client'
import { Button } from '@/components/ui/button'
import { AgentSelector } from '@/components/playground/Sidebar/AgentSelector'
import useChatActions from '@/hooks/useChatActions'
import { usePlaygroundStore } from '@/store'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import Icon from '@/components/ui/icon'
import { getProviderIcon } from '@/lib/modelProvider'
import Sessions from './Sessions'
import { isValidUrl } from '@/lib/utils'
import { toast } from 'sonner'
import { useQueryState } from 'nuqs'
import { truncateText } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

const SidebarHeader = () => (
  <div className="flex items-center gap-2">
    <Icon type="agno" size="xs" />
    <span className="text-xs font-medium uppercase text-white">Agent UI</span>
  </div>
)

const NewChatButton = ({
  disabled,
  onClick
}: {
  disabled: boolean
  onClick: () => void
}) => (
  <Button
    onClick={onClick}
    disabled={disabled}
    size="lg"
    className="h-9 w-full rounded-xl bg-primary text-xs font-medium text-background hover:bg-primary/80"
  >
    <Icon type="plus-icon" size="xs" className="text-background" />
    <span className="uppercase">New Chat</span>
  </Button>
)

const ModelDisplay = ({ model }: { model: string }) => (
  <div className="flex h-9 w-full items-center gap-3 rounded-xl border border-primary/15 bg-accent p-3 text-xs font-medium uppercase text-muted">
    {(() => {
      const icon = getProviderIcon(model)
      return icon ? <Icon type={icon} className="shrink-0" size="xs" /> : null
    })()}
    {model}
  </div>
)

const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const { clearChat, focusChatInput, initializePlayground } = useChatActions()
  const {
    messages,
    selectedEndpoint,
    isEndpointActive,
    selectedModel,
    hydrated,
    isEndpointLoading,
    setIsEndpointActive
  } = usePlaygroundStore()
  const [isMounted, setIsMounted] = useState(false)
  const [agentId] = useQueryState('agent')
  
  useEffect(() => {
    setIsMounted(true)
    if (hydrated) {
      initializePlayground()
      setIsEndpointActive(true) // Force endpoint to be active
    }
  }, [selectedEndpoint, initializePlayground, hydrated, setIsEndpointActive])
  
  const handleNewChat = () => {
    clearChat()
    focusChatInput()
  }
  return (
    <motion.aside
      className="relative flex h-screen shrink-0 grow-0 flex-col overflow-hidden px-2 py-3 font-dmmono"
      initial={{ width: '16rem' }}
      animate={{ width: isCollapsed ? '2.5rem' : '16rem' }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <motion.button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute right-2 top-2 z-10 p-1"
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        type="button"
        whileTap={{ scale: 0.95 }}
      >
        <Icon
          type="sheet"
          size="xs"
          className={`transform ${isCollapsed ? 'rotate-180' : 'rotate-0'}`}
        />
      </motion.button>
      <motion.div
        className="w-60 space-y-5"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: isCollapsed ? 0 : 1, x: isCollapsed ? -20 : 0 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        style={{
          pointerEvents: isCollapsed ? 'none' : 'auto'
        }}
      >
        <SidebarHeader />
        <NewChatButton
          disabled={false} // Always enable the button
          onClick={handleNewChat}
        />
        {isMounted && (
          <>
            {/* Always show agent section regardless of endpoint status */}
            <motion.div
              className="flex w-full flex-col items-start gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
            >
              <div className="text-xs font-medium uppercase text-primary">
                Agent
              </div>
              {isEndpointLoading ? (
                <div className="flex w-full flex-col gap-2">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <Skeleton
                      key={index}
                      className="h-9 w-full rounded-xl"
                    />
                  ))}
                </div>
              ) : (
                <>
                  <AgentSelector />
                  {selectedModel && agentId && (
                    <ModelDisplay model={selectedModel} />
                  )}
                </>
              )}
            </motion.div>
            <Sessions />
          </>
        )}
      </motion.div>
    </motion.aside>
  )
}

export default Sidebar
