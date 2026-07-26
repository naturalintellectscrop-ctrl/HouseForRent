'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import { io, Socket } from 'socket.io-client';
import {
  MessageSquare, MessageCircle, Send, ArrowLeft, Loader2, Search, Wifi, WifiOff,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import EmptyState from './EmptyState';
import { useAppStore, type Inquiry, type Message } from '@/store/useAppStore';
import { toast } from 'sonner';

interface TypingUser {
  userId: string;
  userName: string;
  inquiryId: string;
}

interface OnlineUser {
  userId: string;
}

export default function ChatView() {
  const { user, selectedInquiryId, setSelectedInquiryId, setShowAuthModal, setAuthMode, setCurrentView } = useAppStore();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Map<string, OnlineUser[]>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [showChatMobile, setShowChatMobile] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const activeInquiryIdRef = useRef<string | null>(null);

  // Keep refs in sync
  userIdRef.current = user?.id || null;
  activeInquiryIdRef.current = selectedInquiryId;

  // Initialize Socket.IO connection (once per user session)
  useEffect(() => {
    if (!user) return;

    const socketInstance = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    });

    socketInstance.on('connect', () => {
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
    });

    socketInstance.on('connect_error', () => {
      // Silently handle - reconnection will retry
    });

    // Listen for new messages
    socketInstance.on('new-message', (msg: Message) => {
      setInquiries((prev) =>
        prev.map((inq) => {
          if (inq.id === msg.inquiryId) {
            const exists = inq.messages?.some((m) => m.id === msg.id);
            if (exists) return inq;
            return {
              ...inq,
              messages: [...(inq.messages || []), msg],
            };
          }
          return inq;
        })
      );
    });

    // Listen for typing indicators
    socketInstance.on('typing', (data: TypingUser) => {
      setTypingUsers((prev) => {
        if (prev.some((u) => u.userId === data.userId && u.inquiryId === data.inquiryId)) return prev;
        return [...prev, data];
      });
    });

    socketInstance.on('stop-typing', (data: { userId: string; inquiryId: string }) => {
      setTypingUsers((prev) =>
        prev.filter((u) => !(u.userId === data.userId && u.inquiryId === data.inquiryId))
      );
    });

    // Listen for online/offline status
    socketInstance.on('user-online', (data: { userId: string; inquiryId: string }) => {
      setOnlineUsers((prev) => {
        const newMap = new Map(prev);
        const users = newMap.get(data.inquiryId) || [];
        if (!users.some((u) => u.userId === data.userId)) {
          newMap.set(data.inquiryId, [...users, { userId: data.userId }]);
        }
        return newMap;
      });
    });

    socketInstance.on('user-offline', (data: { userId: string; inquiryId: string }) => {
      setOnlineUsers((prev) => {
        const newMap = new Map(prev);
        const users = newMap.get(data.inquiryId) || [];
        newMap.set(
          data.inquiryId,
          users.filter((u) => u.userId !== data.userId)
        );
        return newMap;
      });
    });

    socketInstance.on('online-users', (data: { inquiryId: string; users: string[] }) => {
      setOnlineUsers((prev) => {
        const newMap = new Map(prev);
        newMap.set(
          data.inquiryId,
          data.users.map((id) => ({ userId: id }))
        );
        return newMap;
      });
    });

    // Listen for messages-read
    socketInstance.on('messages-read', (data: { userId: string; inquiryId: string }) => {
      const currentUserId = userIdRef.current;
      setInquiries((prev) =>
        prev.map((inq) => {
          if (inq.id === data.inquiryId) {
            return {
              ...inq,
              messages: inq.messages?.map((msg) =>
                msg.senderId === currentUserId ? { ...msg, read: true } : msg
              ),
            };
          }
          return inq;
        })
      );
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [user]);

  // Fetch inquiries
  const fetchInquiries = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch('/api/inquiries');
      if (res.ok) {
        const data = await res.json();
        setInquiries(data);
      }
    } catch {
      toast.error('Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchInquiries();
  }, [fetchInquiries]);

  // Join room when selecting an inquiry
  useEffect(() => {
    if (socket && selectedInquiryId && user && isConnected) {
      socket.emit('join-room', {
        userId: user.id,
        inquiryId: selectedInquiryId,
      });

      // Mark messages as read via REST API
      fetch('/api/inquiries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiryId: selectedInquiryId }),
      }).catch(() => {
        // Silently fail - not critical
      });

      // Notify via socket
      socket.emit('mark-read', {
        userId: user.id,
        inquiryId: selectedInquiryId,
      });

      // Update local state to mark messages as read
      setInquiries((prev) =>
        prev.map((inq) => {
          if (inq.id === selectedInquiryId) {
            return {
              ...inq,
              messages: inq.messages?.map((msg) =>
                msg.senderId !== user.id && !msg.read ? { ...msg, read: true } : msg
              ),
            };
          }
          return inq;
        })
      );
    }
  }, [socket, selectedInquiryId, user, isConnected]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [inquiries, selectedInquiryId]);

  const selectedInquiry = inquiries.find((i) => i.id === selectedInquiryId);

  // Get unread count for an inquiry
  const getUnreadCount = useCallback(
    (inquiry: Inquiry) => {
      if (!user) return 0;
      return (inquiry.messages || []).filter(
        (msg) => !msg.read && msg.senderId !== user.id
      ).length;
    },
    [user]
  );

  // Send message
  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedInquiryId || !user) return;
    setSendingMessage(true);

    const content = messageText.trim();
    setMessageText('');

    // Stop typing
    if (isTypingRef.current && socket) {
      isTypingRef.current = false;
      socket.emit('stop-typing', {
        userId: user.id,
        inquiryId: selectedInquiryId,
      });
    }

    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiryId: selectedInquiryId, content }),
      });

      if (res.ok) {
        const newMessage = await res.json();
        // Update local state
        setInquiries((prev) =>
          prev.map((inq) =>
            inq.id === selectedInquiryId
              ? { ...inq, messages: [...(inq.messages || []), newMessage] }
              : inq
          )
        );
        // Broadcast via socket
        if (socket) {
          socket.emit('send-message', {
            userId: user.id,
            userName: user.name,
            inquiryId: selectedInquiryId,
            content,
            messageId: newMessage.id,
          });
        }
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to send message');
        setMessageText(content);
      }
    } catch {
      toast.error('Failed to send message');
      setMessageText(content);
    } finally {
      setSendingMessage(false);
    }
  };

  // Handle typing
  const handleTyping = (value: string) => {
    setMessageText(value);

    if (!socket || !selectedInquiryId || !user) return;

    if (value.trim() && !isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit('typing', {
        userId: user.id,
        userName: user.name,
        inquiryId: selectedInquiryId,
      });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        socket.emit('stop-typing', {
          userId: user.id,
          inquiryId: selectedInquiryId,
        });
      }
    }, 2000);

    if (!value.trim()) {
      isTypingRef.current = false;
      socket.emit('stop-typing', {
        userId: user.id,
        inquiryId: selectedInquiryId,
      });
    }
  };

  // Select inquiry
  const handleSelectInquiry = (inquiryId: string) => {
    setSelectedInquiryId(inquiryId);
    setShowChatMobile(true);
  };

  // Back to list on mobile
  const handleBackToList = () => {
    setShowChatMobile(false);
    setSelectedInquiryId(null);
  };

  // Filter inquiries by search
  const filteredInquiries = inquiries.filter((inquiry) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const otherPerson = user?.role === 'TENANT' ? inquiry.property?.landlord : inquiry.tenant;
    return (
      otherPerson?.name?.toLowerCase().includes(q) ||
      inquiry.property?.title?.toLowerCase().includes(q) ||
      (inquiry.messages || []).some((msg) => msg.content.toLowerCase().includes(q))
    );
  });

  // Get typing users for current inquiry
  const currentTypingUsers = typingUsers.filter(
    (t) => t.inquiryId === selectedInquiryId && t.userId !== user?.id
  );

  // Not authenticated
  if (!user) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState
          icon={MessageSquare}
          title="Login to View Messages"
          description="Sign in to chat with landlords and tenants in real-time. Stay connected throughout your rental journey."
          actionLabel="Login"
          onAction={() => {
            setAuthMode('login');
            setShowAuthModal(true);
          }}
        />
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="h-8 w-40 animate-pulse rounded bg-muted mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
          <div className="lg:col-span-2 h-96 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  // Empty state
  if (inquiries.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold sm:text-3xl">Messages</h1>
          <p className="mt-2 text-muted-foreground">
            Real-time conversations with landlords and tenants
          </p>
        </div>
        <EmptyState
          icon={MessageCircle}
          title="No Conversations Yet"
          description="Start a conversation by inquiring about a property. Your messages will appear here in real-time."
          actionLabel="Browse Properties"
          onAction={() => setCurrentView('home')}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Messages</h1>
            <p className="mt-1 text-muted-foreground">
              Real-time conversations with {user.role === 'TENANT' ? 'landlords' : 'tenants'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800">
                <Wifi className="mr-1 h-3 w-3" />
                Live
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800">
                <WifiOff className="mr-1 h-3 w-3" />
                Offline
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-280px)] min-h-[500px]">
        {/* Conversation List */}
        <div
          className={`lg:col-span-1 overflow-hidden rounded-xl border bg-card ${
            showChatMobile ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'
          }`}
        >
          {/* Search */}
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                className="pl-9 h-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* List */}
          <ScrollArea className="flex-1">
            <div className="divide-y">
              {filteredInquiries.map((inquiry) => {
                const otherPerson =
                  user.role === 'TENANT' ? inquiry.property?.landlord : inquiry.tenant;
                const lastMessage = inquiry.messages?.[inquiry.messages.length - 1];
                const unread = getUnreadCount(inquiry);
                const isActive = selectedInquiryId === inquiry.id;
                const isOnline = onlineUsers
                  .get(inquiry.id)
                  ?.some((u) => u.userId === otherPerson?.id);

                return (
                  <button
                    key={inquiry.id}
                    className={`w-full text-left p-4 transition-colors hover:bg-muted/50 ${
                      isActive ? 'bg-red-50 border-l-2 border-l-red-600 dark:bg-red-950/50' : ''
                    }`}
                    onClick={() => handleSelectInquiry(inquiry.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative shrink-0">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={otherPerson?.avatar || undefined} alt={otherPerson?.name} />
                          <AvatarFallback className="bg-red-100 text-red-700 text-xs dark:bg-red-900 dark:text-red-300">
                            {otherPerson?.name?.charAt(0) || '?'}
                          </AvatarFallback>
                        </Avatar>
                        {isOnline && (
                          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-red-500 border-2 border-white dark:border-gray-800" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm truncate ${unread > 0 ? 'font-semibold' : 'font-medium'}`}>
                            {otherPerson?.name || 'Unknown'}
                          </p>
                          {unread > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shrink-0">
                              {unread > 9 ? '9+' : unread}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {inquiry.property?.title || 'Property'}
                        </p>
                        {lastMessage && (
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <p className={`text-xs truncate ${unread > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                              {lastMessage.senderId === user.id ? 'You: ' : ''}
                              {lastMessage.content}
                            </p>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                              {format(new Date(lastMessage.createdAt), 'MMM d')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              {filteredInquiries.length === 0 && searchQuery && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No conversations matching &ldquo;{searchQuery}&rdquo;
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Chat Area */}
        <div
          className={`lg:col-span-2 overflow-hidden rounded-xl border bg-card flex flex-col ${
            showChatMobile ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {selectedInquiry ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden shrink-0"
                  onClick={handleBackToList}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="relative shrink-0">
                    <Avatar className="h-9 w-9">
                      <AvatarImage
                        src={
                          user.role === 'TENANT'
                            ? selectedInquiry.property?.landlord?.avatar
                            : selectedInquiry.tenant?.avatar || undefined
                        }
                        alt={
                          user.role === 'TENANT'
                            ? selectedInquiry.property?.landlord?.name
                            : selectedInquiry.tenant?.name || ''
                        }
                      />
                      <AvatarFallback className="bg-red-100 text-red-700 text-xs dark:bg-red-900 dark:text-red-300">
                        {(user.role === 'TENANT'
                          ? selectedInquiry.property?.landlord?.name
                          : selectedInquiry.tenant?.name
                        )?.charAt(0) || '?'}
                      </AvatarFallback>
                    </Avatar>
                    {onlineUsers
                      .get(selectedInquiry.id)
                      ?.some(
                        (u) =>
                          u.userId ===
                          (user.role === 'TENANT'
                            ? selectedInquiry.property?.landlord?.id
                            : selectedInquiry.tenant?.id)
                      ) && (
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-red-500 border-2 border-white dark:border-gray-800" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {user.role === 'TENANT'
                        ? selectedInquiry.property?.landlord?.name
                        : selectedInquiry.tenant?.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      Re: {selectedInquiry.property?.title}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] shrink-0 ${
                    selectedInquiry.status === 'REPLIED'
                      ? 'border-red-300 text-red-700 dark:border-red-700 dark:text-red-300'
                      : selectedInquiry.status === 'CLOSED'
                        ? 'border-red-300 text-red-700 dark:border-red-700 dark:text-red-300'
                        : ''
                  }`}
                >
                  {selectedInquiry.status}
                </Badge>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3">
                  {selectedInquiry.messages?.map((msg, index) => {
                    const isOwnMessage = msg.senderId === user.id;
                    const prevMsg = selectedInquiry.messages?.[index - 1];
                    const showAvatar = !prevMsg || prevMsg.senderId !== msg.senderId;
                    const showTimestamp =
                      !prevMsg ||
                      new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() > 300000;

                    return (
                      <div key={msg.id}>
                        {showTimestamp && (
                          <div className="flex items-center justify-center my-3">
                            <span className="text-[10px] text-muted-foreground bg-muted px-3 py-1 rounded-full">
                              {format(new Date(msg.createdAt), 'MMM d, yyyy h:mm a')}
                            </span>
                          </div>
                        )}
                        <div
                          className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} ${
                            showAvatar ? 'mt-2' : 'mt-0.5'
                          }`}
                        >
                          {!isOwnMessage && showAvatar && (
                            <Avatar className="h-7 w-7 mr-2 mt-1 shrink-0">
                              <AvatarImage
                                src={
                                  user.role === 'TENANT'
                                    ? selectedInquiry.property?.landlord?.avatar
                                    : selectedInquiry.tenant?.avatar || undefined
                                }
                                alt="Sender"
                              />
                              <AvatarFallback className="bg-red-100 text-red-700 text-[10px] dark:bg-red-900 dark:text-red-300">
                                {(user.role === 'TENANT'
                                  ? selectedInquiry.property?.landlord?.name
                                  : selectedInquiry.tenant?.name
                                )?.charAt(0) || '?'}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          {!isOwnMessage && !showAvatar && <div className="w-7 mr-2 shrink-0" />}
                          <div
                            className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                              isOwnMessage
                                ? 'bg-red-600 text-white rounded-br-md'
                                : 'bg-muted rounded-bl-md'
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                            <div className="flex items-center gap-1 mt-1">
                              <p
                                className={`text-[10px] ${
                                  isOwnMessage ? 'text-red-200' : 'text-muted-foreground'
                                }`}
                              >
                                {format(new Date(msg.createdAt), 'h:mm a')}
                              </p>
                              {isOwnMessage && (
                                <span className={`text-[10px] ${msg.read ? 'text-red-200' : 'text-red-300/60'}`}>
                                  {msg.read ? '✓✓' : '✓'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Typing indicator */}
                  <AnimatePresence>
                    {currentTypingUsers.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="flex justify-start items-center gap-2 mt-2"
                      >
                        <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5 flex items-center gap-1.5">
                          <div className="flex gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
                          </div>
                          <span className="text-xs text-muted-foreground ml-1">
                            {currentTypingUsers[0].userName} is typing...
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Message Input */}
              <div className="p-4 border-t">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex gap-2"
                >
                  <Input
                    placeholder="Type a message..."
                    value={messageText}
                    onChange={(e) => handleTyping(e.target.value)}
                    className="flex-1"
                    disabled={sendingMessage}
                    autoFocus
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="bg-red-600 hover:bg-red-700 text-white shrink-0"
                    disabled={sendingMessage || !messageText.trim()}
                  >
                    {sendingMessage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </form>
                {!isConnected && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <WifiOff className="h-3 w-3" />
                    Reconnecting to chat server...
                  </p>
                )}
              </div>
            </>
          ) : (
            <EmptyState
              icon={MessageSquare}
              title="Select a Conversation"
              description="Choose a conversation from the sidebar to start chatting. Messages are delivered in real-time."
            />
          )}
        </div>
      </div>
    </div>
  );
}
