-- Add sync.events_available to FlowgladEventType enum
ALTER TYPE "FlowgladEventType" ADD VALUE IF NOT EXISTS 'sync.events_available';

-- Add sync_stream to EventNoun enum
ALTER TYPE "EventNoun" ADD VALUE IF NOT EXISTS 'sync_stream';
