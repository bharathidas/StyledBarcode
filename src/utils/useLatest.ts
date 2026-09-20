import { MutableRefObject, useEffect, useRef } from "react";

/** A ref that always holds the latest value, updated after each commit so render stays pure. */
export function useLatest<T>(value: T): MutableRefObject<T> {
    const ref = useRef<T>(value);
    useEffect(() => {
        ref.current = value;
    });
    return ref;
}
