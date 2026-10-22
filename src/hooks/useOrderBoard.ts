import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import type { BoardCard, BoardColor, BoardData, BoardList } from "@/lib/orderBoard";

export const ORDER_BOARD_KEY = ["/api/order-board"] as const;

async function boardRequest<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await apiFetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Something went wrong. Try again.");
  return data as T;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong. Try again.");

export function useOrderBoard() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ORDER_BOARD_KEY,
    queryFn: () => boardRequest<BoardData>("/api/order-board", "GET"),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const setBoard = useCallback((update: (board: BoardData) => BoardData) => {
    queryClient.setQueryData<BoardData>(ORDER_BOARD_KEY, (board) => (board ? update(board) : board));
  }, [queryClient]);

  // Applies the change on screen first, then saves; if the save fails the board reloads.
  const optimistic = useCallback(async <T,>(change: (board: BoardData) => BoardData, save: () => Promise<T>): Promise<T | null> => {
    // Synchronous, so a dropped card never flashes back to its old list for a frame.
    setBoard(change);
    void queryClient.cancelQueries({ queryKey: ORDER_BOARD_KEY }, { revert: false });
    try {
      return await save();
    } catch (error) {
      toast.error(errorText(error));
      void queryClient.invalidateQueries({ queryKey: ORDER_BOARD_KEY });
      return null;
    }
  }, [queryClient, setBoard]);

  const addCard = useCallback(async (orderId: string, listId: string): Promise<BoardCard | null> => {
    try {
      const { card } = await boardRequest<{ card: BoardCard }>("/api/order-board/cards", "POST", { order_id: orderId, list_id: listId });
      setBoard((board) => ({ ...board, cards: [...board.cards.filter((c) => c.id !== card.id), card] }));
      return card;
    } catch (error) {
      toast.error(errorText(error));
      return null;
    }
  }, [setBoard]);

  const updateCard = useCallback((cardId: string, patch: Partial<Pick<BoardCard, "list_id" | "position" | "note" | "remind_on">>) => optimistic(
    (board) => ({ ...board, cards: board.cards.map((card) => (card.id === cardId ? { ...card, ...patch } : card)) }),
    () => boardRequest<{ card: BoardCard }>(`/api/order-board/cards/${cardId}`, "PATCH", patch),
  ), [optimistic]);

  const removeCard = useCallback((cardId: string) => optimistic(
    (board) => ({ ...board, cards: board.cards.filter((card) => card.id !== cardId) }),
    () => boardRequest(`/api/order-board/cards/${cardId}`, "DELETE"),
  ), [optimistic]);

  const addList = useCallback(async (name: string, color: BoardColor): Promise<BoardList | null> => {
    try {
      const { list } = await boardRequest<{ list: BoardList }>("/api/order-board/lists", "POST", { name, color });
      setBoard((board) => ({ ...board, lists: [...board.lists, list] }));
      return list;
    } catch (error) {
      toast.error(errorText(error));
      return null;
    }
  }, [setBoard]);

  const updateList = useCallback((listId: string, patch: Partial<Pick<BoardList, "name" | "color">>) => optimistic(
    (board) => ({ ...board, lists: board.lists.map((list) => (list.id === listId ? { ...list, ...patch } : list)) }),
    () => boardRequest(`/api/order-board/lists/${listId}`, "PATCH", patch),
  ), [optimistic]);

  const removeList = useCallback((listId: string) => optimistic(
    (board) => ({ ...board, lists: board.lists.filter((list) => list.id !== listId) }),
    () => boardRequest(`/api/order-board/lists/${listId}`, "DELETE"),
  ), [optimistic]);

  return { ...query, addCard, updateCard, removeCard, addList, updateList, removeList };
}
