'use client';

import { useEffect, useState, useRef } from 'react';
import { format } from 'date-fns';
import {
  MessageSquare, Send, ArrowLeft, Home, Loader2, User
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import EmptyState from './EmptyState';
import { useAppStore, type Inquiry, type Message } from '@/store/useAppStore';
import { toast } from 'sonner';

export default function InquiriesView() {
  const { user, selectedInquiryId, setSelectedInquiryId, setShowAuthModal, setAuthMode, setCurrentView } = useAppStore();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchInquiries = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch('/api/inquiries');
      if (res.ok) {
        const data = await res.json();
        setInquiries(data);
      }
    } catch {
      toast.error('Failed to load inquiries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInquiries();
  }, [user]);

  const selectedInquiry = inquiries.find((i) => i.id === selectedInquiryId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedInquiry?.messages]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedInquiryId) return;
    setSendingMessage(true);
    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiryId: selectedInquiryId, content: messageText }),
      });
      if (res.ok) {
        const newMessage = await res.json();
        setInquiries((prev) =>
          prev.map((inq) =>
            inq.id === selectedInquiryId
              ? { ...inq, messages: [...(inq.messages || []), newMessage] }
              : inq
          )
        );
        setMessageText('');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to send message');
      }
    } catch {
      toast.error('Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState
          icon={MessageSquare}
          title="Login to View Messages"
          description="Sign in to communicate with landlords and tenants about properties."
          actionLabel="Login"
          onAction={() => { setAuthMode('login'); setShowAuthModal(true); }}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="h-8 w-40 animate-pulse rounded bg-muted mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
          <div className="lg:col-span-2 h-96 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold sm:text-3xl">Messages</h1>
        <p className="mt-2 text-muted-foreground">
          {user.role === 'TENANT' ? 'Your conversations with landlords' : 'Inquiries about your properties'}
        </p>
      </div>

      {inquiries.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No Inquiries Yet"
          description="Your property inquiries will appear here once you start reaching out to landlords."
          actionLabel="Browse Properties"
          onAction={() => setCurrentView('home')}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-280px)] min-h-[400px]">
          {/* Inquiry List */}
          <div className="lg:col-span-1 overflow-hidden rounded-xl border bg-card">
            <div className="p-4 border-b">
              <h3 className="font-semibold text-sm">Conversations</h3>
            </div>
            <ScrollArea className="h-[calc(100%-52px)]">
              <div className="divide-y">
                {inquiries.map((inquiry) => {
                  const otherPerson = user.role === 'TENANT' ? inquiry.property?.landlord : inquiry.tenant;
                  const lastMessage = inquiry.messages?.[inquiry.messages.length - 1];
                  const propertyImage = inquiry.property?.images?.[0]?.url;

                  return (
                    <button
                      key={inquiry.id}
                      className={`w-full text-left p-4 transition-colors hover:bg-muted/50 ${
                        selectedInquiryId === inquiry.id ? 'bg-red-50 border-l-2 border-l-red-600' : ''
                      }`}
                      onClick={() => setSelectedInquiryId(inquiry.id)}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarImage src={otherPerson?.avatar || undefined} alt={otherPerson?.name} />
                          <AvatarFallback className="bg-red-100 text-red-700 text-xs">
                            {otherPerson?.name?.charAt(0) || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-sm truncate">{otherPerson?.name || 'Unknown'}</p>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {inquiry.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {inquiry.property?.title || 'Property'}
                          </p>
                          {lastMessage && (
                            <p className="text-xs text-muted-foreground truncate mt-1">
                              {lastMessage.content}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Chat Area */}
          <div className="lg:col-span-2 overflow-hidden rounded-xl border bg-card flex flex-col">
            {selectedInquiry ? (
              <>
                {/* Chat Header */}
                <div className="p-4 border-b flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="lg:hidden"
                    onClick={() => setSelectedInquiryId(null)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
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
                      <AvatarFallback className="bg-red-100 text-red-700 text-xs">
                        {(user.role === 'TENANT'
                          ? selectedInquiry.property?.landlord?.name
                          : selectedInquiry.tenant?.name)?.charAt(0) || '?'}
                      </AvatarFallback>
                    </Avatar>
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
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-4">
                    {selectedInquiry.messages?.map((msg) => {
                      const isOwnMessage = msg.senderId === user.id;

                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                              isOwnMessage
                                ? 'bg-red-600 text-white rounded-br-md'
                                : 'bg-muted rounded-bl-md'
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            <p className={`text-[10px] mt-1 ${isOwnMessage ? 'text-red-200' : 'text-muted-foreground'}`}>
                              {format(new Date(msg.createdAt), 'MMM d, h:mm a')}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Message Input */}
                <div className="p-4 border-t">
                  <form
                    onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                    className="flex gap-2"
                  >
                    <Input
                      placeholder="Type a message..."
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      className="flex-1"
                      disabled={sendingMessage}
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
                </div>
              </>
            ) : (
              <EmptyState
                icon={MessageSquare}
                title="Select a Conversation"
                description="Choose a conversation from the list to view messages."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
