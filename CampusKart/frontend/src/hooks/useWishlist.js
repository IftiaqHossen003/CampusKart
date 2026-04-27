import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWishlist, toggleWishlist } from "../api/wishlist";
import { useAuthStore } from "../store/authStore";
import { useToast } from "./useToast";

const WISHLIST_QUERY_KEY = ["wishlist-items"];

function buildOptimisticWishlistEntry(product) {
  return {
    id: `temp-${product.id}`,
    product: {
      id: product.id,
      name: product.name,
      slug: product.slug,
      price: product.price,
      discount_price: product.discount_price,
      avg_rating: product.avg_rating,
      status: product.status,
      vendor_name: product.vendor_name,
      images: product.images,
      stock: product.stock,
    },
    added_at: new Date().toISOString(),
  };
}

function normalizeWishlistData(previous) {
  if (!previous || typeof previous !== "object") {
    return { count: 0, results: [] };
  }

  const results = Array.isArray(previous.results) ? previous.results : [];
  return {
    ...previous,
    count: Number(previous.count ?? results.length),
    results,
  };
}

export function useWishlist() {
  const queryClient = useQueryClient();
  const { showError } = useToast();
  const user = useAuthStore((state) => state.user);
  const isStudent = user?.role === "student";

  const wishlistQuery = useQuery({
    queryKey: WISHLIST_QUERY_KEY,
    queryFn: fetchWishlist,
    enabled: isStudent,
    staleTime: 30 * 1000,
  });

  const wishlistedIds = useMemo(() => {
    if (!Array.isArray(wishlistQuery.data?.results)) {
      return new Set();
    }

    return new Set(
      wishlistQuery.data.results
        .map((item) => item?.product?.id)
        .filter((id) => id !== null && id !== undefined),
    );
  }, [wishlistQuery.data]);

  const toggleWishlistMutation = useMutation({
    mutationFn: ({ productId }) => toggleWishlist(productId),
    onMutate: async ({ product }) => {
      await queryClient.cancelQueries({ queryKey: WISHLIST_QUERY_KEY });

      const previousWishlist = queryClient.getQueryData(WISHLIST_QUERY_KEY);
      const normalized = normalizeWishlistData(previousWishlist);
      const currentlyWishlisted = normalized.results.some(
        (item) => item?.product?.id === product.id,
      );

      const nextResults = currentlyWishlisted
        ? normalized.results.filter((item) => item?.product?.id !== product.id)
        : [buildOptimisticWishlistEntry(product), ...normalized.results];

      queryClient.setQueryData(WISHLIST_QUERY_KEY, {
        ...normalized,
        count: nextResults.length,
        results: nextResults,
      });

      return { previousWishlist };
    },
    onError: (error, _variables, context) => {
      if (context?.previousWishlist) {
        queryClient.setQueryData(WISHLIST_QUERY_KEY, context.previousWishlist);
      }

      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.non_field_errors?.[0] ||
        "Could not update wishlist.";
      showError(detail);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: WISHLIST_QUERY_KEY });
    },
  });

  const toggleProductWishlist = (product) => {
    if (!isStudent) {
      showError("Please log in as a student to use wishlist.");
      return;
    }

    if (!product?.id) {
      showError("Invalid product for wishlist action.");
      return;
    }

    toggleWishlistMutation.mutate({ productId: product.id, product });
  };

  return {
    isStudent,
    wishlistQuery,
    wishlistedIds,
    isWishlisted: (productId) => wishlistedIds.has(productId),
    toggleProductWishlist,
    isTogglingWishlist: toggleWishlistMutation.isPending,
  };
}
